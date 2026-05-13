## Description
<!-- Summarize what has been done. GitHub Copilot/Claude uses this to understand the overall context. -->
<!-- What was done and why. Link the related issue: Closes #123 -->

## Changes
<!-- This section will be used to generate release notes. Keep it concise. -->
<!-- Suggested format:
  [FEAT] Added `log-meal` MCP tool to register meals via assistant
  [FIX] Corrected macro calculation when food has zero serving size
  [REFACTOR] Extracted timezone-aware date helpers from ProgressService
-->

## How to Test / Points to Consider
<!-- This helps the reviewer and Copilot/Claude know where to focus. -->
1. Simple step-by-step instructions for testing (e.g., Call the `log-meal` MCP tool with a custom food and check the meal appears in `GET /nutrition/meals`).
2. Indicate whether there were any changes to the database (e.g., "Requires running `npx prisma migrate dev`") or environment variables.

## Checklist
- [ ] The code compiles/runs without any new errors.
- [ ] I performed a self-review of my own code.
- [ ] No leftover debug code (`console.log`, commented blocks) remains.
- [ ] Dependencies (if any) have been updated.
- [ ] I ensured no framework/infra imports leaked into pure helper modules (`apps/api/src/*/helpers`).
- [ ] I updated the corresponding skill in `.claude/skills/`.