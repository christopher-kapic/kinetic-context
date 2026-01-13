import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col justify-center text-center flex-1 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          kinetic-context
        </h1>
        <p className="text-xl text-muted-foreground mb-8">
          An MCP server for getting information about open-source dependencies
        </p>
        <p className="text-lg mb-8">
          Query dependencies, manage projects, and get AI-powered answers about how to use open-source packages.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link
            href="/docs/getting-started"
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Get Started
          </Link>
          <Link
            href="/docs"
            className="px-6 py-3 border border-border rounded-lg font-medium hover:bg-accent transition-colors"
          >
            View Documentation
          </Link>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mt-12">
          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">MCP Server</h3>
            <p className="text-sm text-muted-foreground">
              Connect your AI coding tools to query dependencies and get intelligent answers
            </p>
          </div>
          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">Easy Setup</h3>
            <p className="text-sm text-muted-foreground">
              Run with Docker in minutes. No complex configuration required
            </p>
          </div>
          <div className="p-6 border rounded-lg">
            <h3 className="font-semibold mb-2">Version Control</h3>
            <p className="text-sm text-muted-foreground">
              Pin specific versions per project and manage dependencies easily
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
