# Change: Add Diff View to Pane Workspace

## Why
Pane view currently lacks the chat diff sidebar even though each pane maps to a workspace. Adding the diff view enables reviewing and managing workspace changes without leaving pane mode.

## What Changes
- Add workspace diff view in pane layout with the same UI as chat diff (sidebar/dialog/full-page).
- Route AI actions (Review/Create PR with AI) to the focused pane's sub-chat.
- Add project-based PR context and AI commit message generation endpoints to support pane view.

## Impact
- Affected specs: diff-view
- Affected code: renderer pane layout, diff view components, tRPC chat routers
