import { existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import simpleGit from "simple-git";

/**
 * Normalize a git URL to create a consistent identifier for the repository.
 * This allows multiple packages from the same repo to share the same clone.
 */
export function getRepoIdentifierFromUrl(gitUrl: string): string {
  // Normalize the URL by removing protocol variations and .git suffix
  let normalized = gitUrl
    .replace(/^https?:\/\//, "") // Remove http:// or https://
    .replace(/^git@/, "") // Remove git@
    .replace(/\.git$/, "") // Remove .git suffix
    .replace(/:/g, "/") // Replace : with / (for SSH URLs like git@github.com:user/repo)
    .toLowerCase()
    .trim();

  // Create a safe filesystem identifier
  // Replace any problematic characters with underscores
  const safeIdentifier = normalized
    .replace(/[^a-z0-9\/._-]/g, "_")
    .replace(/\/+/g, "/") // Collapse multiple slashes
    .replace(/^\/+/, "") // Remove leading slashes
    .replace(/\/+$/, ""); // Remove trailing slashes

  // If the identifier is too long or still problematic, use a hash
  if (safeIdentifier.length > 200 || safeIdentifier.includes("..")) {
    const hash = createHash("sha256").update(gitUrl).digest("hex").substring(0, 16);
    return `repo_${hash}`;
  }

  return safeIdentifier || `repo_${createHash("sha256").update(gitUrl).digest("hex").substring(0, 16)}`;
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
 * For existing repos, just verifies the path exists.
 * For cloned repos, uses the git URL to determine the shared repo location
 * (so multiple packages from the same repo share the same clone).
 */
export async function ensureRepoAvailable(
  repoPath: string,
  storageType: "cloned" | "existing",
  gitUrl?: string,
  packagesDir?: string,
): Promise<string> {
  if (storageType === "existing") {
    // For existing repos, just verify the path exists
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
 * Only works for cloned repos. Existing repos should not have tags checked out.
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