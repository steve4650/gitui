# Tech Stack

## Backend

Python web server. Managed by uv with pyproject.toml file. pyproject.toml has tornado (web server library), pygit2 (Git library), pytest (test framework). research those APIs as needed.

## Frontend

React project in frontend, which compiles to ./dist directory. Build with `make build`.

# High Level Goal

A beautiful Git UI. For now, we will implement something that views diffs. If you click on a commit, it will display the commit's diff with its parent commit.

# Detailed Goal

Webpage. Left hand panel with commit history of current branch. You should be able to click on individual commits. Figure out a way to display a Git tree with the Git library.

When you click on a commit, it shows the diff. Basic patch format or something displayed with a <pre> element is good enough for now.

Document the API endpoints you create within the source code. Explain the object formats you're requesting and returning. Eventually we'll organize this into an OpenAPI API.

For each API endpoint you create, add a test. Make the tests a well organized library focused on making sure the structure of endpoints is documented/tested thoroughly. Test the endpoints end to end by creating a real temp git directory and staging actual changes to it in the test code.
