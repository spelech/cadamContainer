# AGENTS.md

This file defines the release processes, versioning rules, and development guidelines for the `cadamContainer` project.

---

## 🏷️ Semantic Versioning Rules

We strictly adhere to Semantic Versioning (`MAJOR.MINOR.PATCH`).
*   **MAJOR**: Binned API incompatibilities or framework-breaking changes.
*   **MINOR**: Added features or enhancements that are backwards-compatible.
*   **PATCH**: Backwards-compatible bug fixes or minor dependency bumps.

### Version Bumping Protocol
1.  **Every Pull Request or merge to `main` MUST bump the version** field inside `package.json` following the rules above.
2.  Bumps are performed in the commit prior to merging or directly on the feature branch.
3.  Direct pushes to `main` are restricted. All changes must go through a feature branch and Pull Request.

---

## 🚀 GitHub Actions & CI/CD Pipeline

Every push of a tag (e.g., `v1.2.3`) or push to the `main` branch triggers the GitHub Actions workflow located in `.github/workflows/docker-build.yml`.

### Docker Image Tags
*   **`latest`**: Rebuilt on every push to the `main` branch.
*   **`vX.Y.Z`**: Tagged on every tag push matching the `package.json` release version.

---

## 🔒 Security & Dynamic Configuration

The Docker image built by GitHub Actions is designed to be **portable and generic**.
*   **Vite environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)** are compiled at build time using static placeholder strings.
*   At runtime, `entrypoint.sh` dynamically replaces these placeholders in the compiled frontend bundle with the actual keys provided in the container environment.
*   **Never** bake actual production API keys or credentials directly into the Dockerfile or repository code. Use Compose environment injection instead.

---

## 🔄 Syncing with Upstream

We track the official CADAM repository (`https://github.com/Adam-CAD/CADAM`) as the `upstream` remote.

### How to Merge Upstream Updates:
1.  **Fetch the latest changes**:
    ```bash
    git fetch upstream
    ```
2.  **Merge upstream's main branch** (upstream uses `master` as its main branch):
    ```bash
    git merge upstream/master --no-commit
    ```
    *Note: Using `--no-commit` lets you inspect the changes and handle any configuration files before completing the merge.*
3.  **Resolve Conflicts (if any)**:
    - Ensure your custom containerization files (`Dockerfile`, `entrypoint.sh`, `.github/workflows/`, and `AGENTS.md`) remain untouched.
    - If `package.json` or `vite.config.ts` has conflicts, resolve them so that the custom build configurations (such as build-time ARGs and TanStack base paths) are preserved.
4.  **Commit and push the merge**:
    - Commit the merge:
      ```bash
      git commit -m "merge: sync upstream updates"
      ```
    - Push to your repo to trigger the automated build:
      ```bash
      git push origin main
      ```
