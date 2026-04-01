# Upstream Patches

Chimera Nexus is built on Claudian (MIT license, https://github.com/YishenTu/claudian).

## Patch List

| # | File | Lines Changed | Purpose |
|---|------|---------------|---------|
| 1 | src/core/prompts/mainAgent.ts | ~5 | Add memoryContext param to system prompt |
| 2 | src/core/agent/QueryOptionsBuilder.ts | ~4 | Pass memoryContext through query builder |
| 3 | src/main.ts | ~8 | Initialize ChimeraManager in lifecycle |
| 4 | src/features/chat/controllers/ConversationController.ts | ~5 | Post-session memory extraction hook |
| 5 | src/features/settings/ClaudianSettings.ts | ~3 | Add Chimera settings section |

## Upstream Merge Process

1. git fetch upstream
2. git merge upstream/main --no-commit
3. Check conflicts in the files listed above
4. Re-apply patches following the intent documented here
5. npm test
6. Smoke test in Obsidian
