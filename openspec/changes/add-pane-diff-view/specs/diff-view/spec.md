## ADDED Requirements
### Requirement: Pane Workspace Diff View
The system SHALL provide a diff view in pane mode for each workspace, with the same display modes and core functionality as the chat diff view.

#### Scenario: Open diff in pane view
- **WHEN** the user opens the diff view from the pane layout
- **THEN** the diff UI displays the workspace file list and diff content

### Requirement: Pane Diff AI Actions
The system SHALL route diff view AI actions in pane mode to the focused pane's sub-chat.

#### Scenario: Review from pane diff view
- **WHEN** the user clicks Review in the pane diff view
- **THEN** the review request is sent to the focused pane
