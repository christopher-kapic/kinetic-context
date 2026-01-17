import { existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import simpleGit from "simple-git";

/**
 * Normalize a git URL to create a consistent identifier for the repository.
 * Uses format: [platform]/[userId]/[repo]
 * Example: github.com/christopher-kapic/kinetic-context
 * This allows multiple packages from the same repo to share the same clone.
 */
export function getRepoIdentifierFromUrl(gitUrl: string): string {
  // Normalize the URL by removing protocol variations and .git suffix
  let normalized = gitUrl
    .replace(/^https?:\/\//, "") // Remove http:// or https://
    .replace(/^git@/, "") // Remove git@
    .replace(/\.git$/, "") // Remove .git suffix
    .replace(/:/g, "/") // Replace : with / (for SSH URLs like git@github.com:user/repo)
    .trim();

  // Parse the URL to extract platform, userId, and repo
  // Format should be: platform/userId/repo (and possibly more path segments)
  const parts = normalized.split("/").filter(p => p.length > 0);
  
  if (parts.length < 3) {
    // If we can't parse it properly, fall back to a hash
    const hash = createHash("sha256").update(gitUrl).digest("hex").substring(0, 16);
    return `repo_${hash}`;
  }

  // Extract platform (e.g., github.com, gitlab.com)
  const platform = parts[0].toLowerCase();
  // Extract userId (e.g., christopher-kapic, user)
  const userId = parts[1].toLowerCase();
  // Extract repo name (e.g., kinetic-context, project)
  const repo = parts[2].toLowerCase();

  // Create safe filesystem identifiers (replace problematic characters)
  const safePlatform = platform.replace(/[^a-z0-9._-]/g, "_");
  const safeUserId = userId.replace(/[^a-z0-9._-]/g, "_");
  const safeRepo = repo.replace(/[^a-z0-9._-]/g, "_");

  // Format as: platform/userId/repo
  const identifier = `${safePlatform}/${safeUserId}/${safeRepo}`;

  // If the identifier is too long or still problematic, use a hash
  if (identifier.length > 200 || identifier.includes("..")) {
    const hash = createHash("sha256").update(gitUrl).digest("hex").substring(0, 16);
    return `repo_${hash}`;
  }

  return identifier;
}

/**
 * Clone a repository to the default packages directory.
 * Uses a normalized identifier based on the git URL so multiple packages
 * from the same repo share the same clone.
 * Only used for cloned repos (storage_type: "cloned").
 */
export async function ensureRepoCloned(
  packagesDir: string,
  gitUrl: string,
): Promise<string> {
  // Use normalized repo identifier based on git URL, not package identifier
  // This allows multiple packages from the same repo to share the same clone
  const repoIdentifier = getRepoIdentifierFromUrl(gitUrl);
  const repoPath = join(packagesDir, repoIdentifier);

  if (!existsSync(repoPath)) {
    const git = simpleGit();
    try {
      await git.clone(gitUrl, repoPath);
    } catch (error) {
      throw new Error(
        `Failed to clone repository ${gitUrl} to ${repoPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return repoPath;
}

/**
 * Ensure a repository is available at the given path.
 * For local repos, just verifies the path exists.
 * For cloned repos, uses the git URL to determine the shared repo location
 * (so multiple packages from the same repo share the same clone).
 */
export async function ensureRepoAvailable(
  repoPath: string,
  storageType: "cloned" | "local",
  gitUrl?: string,
  packagesDir?: string,
): Promise<string> {
  if (storageType === "local") {
    // For local repos, just verify the path exists
    if (!existsSync(repoPath)) {
      throw new Error(
        `Repository path does not exist: ${repoPath}. Please verify the path is correct.`,
      );
    }
    return repoPath;
  } else {
    // For cloned repos, use the git URL to determine the shared location
    // This ensures multiple packages from the same repo share the same clone
    if (!gitUrl) {
      throw new Error(
        `Git URL is required for cloned repositories. Path: ${repoPath}`,
      );
    }
    if (!packagesDir) {
      throw new Error(
        `Packages directory is required for cloned repositories.`,
      );
    }
    
    // Use the normalized git URL to get the shared repo location
    return await ensureRepoCloned(packagesDir, gitUrl);
  }
}

/**
 * Checkout a tag/branch in a repository.
 * Only works for cloned repos. Local repos should not have tags checked out.
 */
export async function checkoutTag(
  repoPath: string,
  tag: string,
): Promise<void> {
  const git = simpleGit(repoPath);
  try {
    // Fetch tags first to ensure we have the tag
    await git.fetch(["origin", `refs/tags/${tag}:refs/tags/${tag}`]).catch(
      () => {
        // Ignore fetch errors, tag might already exist locally
      },
    );
    await git.checkout(tag);
  } catch (error) {
    throw new Error(
      `Failed to checkout tag ${tag} in ${repoPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function getRepoPath(
  packagesDir: string,
  identifier: string,
): Promise<string | null> {
  const repoPath = join(packagesDir, identifier);
  if (existsSync(repoPath)) {
    return repoPath;
  }
  return null;
}

export async function getDefaultBranch(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);
  try {
    // Try to get the default branch from origin/HEAD
    const result = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
    if (result) {
      // Result is like "refs/remotes/origin/main" or "refs/remotes/origin/master"
      const branch = result.trim().replace("refs/remotes/origin/", "");
      if (branch) {
        return branch;
      }
    }
  } catch (error) {
    // If that fails, try to get it from the remote
    try {
      const remoteInfo = await git.remote(["show", "origin"]);
      const match = remoteInfo.match(/HEAD branch: (.+)/);
      if (match && match[1]) {
        return match[1].trim();
      }
    } catch (error2) {
      // If that also fails, try common branch names by checking if they exist
      const commonBranches = ["main", "master", "develop", "dev"];
      const branches = await git.branchLocal();
      for (const branch of commonBranches) {
        if (branches.all.includes(branch)) {
          return branch;
        }
      }
    }
  }
  // Fallback to "main"
  return "main";
}

/**
 * Recursively scan a directory for git repositories.
 * Returns an array of discovered repository paths.
 */
export async function discoverGitRepositories(
  rootDir: string,
  maxDepth: number = 10,
): Promise<Array<{ path: string; relativePath: string }>> {
  const repositories: Array<{ path: string; relativePath: string }> = [];
  const { readdir, stat, access } = await import("node:fs/promises");
  const { constants } = await import("node:fs");

  async function isGitRepository(dir: string): Promise<boolean> {
    try {
      const gitPath = join(dir, ".git");
      await access(gitPath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async function scanDirectory(
    dir: string,
    relativePath: string = "",
    depth: number = 0,
  ): Promise<void> {
    if (depth > maxDepth) {
      return;
    }

    try {
      const entries = await readdir(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const newRelativePath = relativePath
          ? join(relativePath, entry)
          : entry;

        try {
          const stats = await stat(fullPath);

          if (stats.isDirectory()) {
            // Check if this directory is a git repository
            if (await isGitRepository(fullPath)) {
              repositories.push({
                path: fullPath,
                relativePath: newRelativePath,
              });
              // Don't scan inside git repos (they might have submodules, but we skip those)
              continue;
            }

            // Skip common directories that shouldn't be scanned
            if (
              entry === "node_modules" ||
              entry === ".git" ||
              entry === "vendor" ||
              entry === "target" ||
              entry === "dist" ||
              entry === "build" ||
              entry === ".next" ||
              entry === ".cache"
            ) {
              continue;
            }

            // Recursively scan subdirectories
            await scanDirectory(fullPath, newRelativePath, depth + 1);
          }
        } catch (error) {
          // Skip directories we can't access
          continue;
        }
      }
    } catch (error) {
      // Skip directories we can't read
      return;
    }
  }

  await scanDirectory(rootDir);
  return repositories;
}