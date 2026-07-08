BLOCKERS

- `frontend/src/App.tsx:14` imports `./TaskGroupControls` and `./taskGroups`, but those files are untracked, so the current git diff/commit would miss the required group pill and random unused color implementation and fail to build from the diff.
