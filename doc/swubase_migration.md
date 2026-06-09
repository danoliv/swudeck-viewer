# swubase dumper migration plan

## Problem
The swubase data dumper currently exists as a Python prototype plus a long prompt/spec. I want to migrate the dumper to JavaScript so it fits the rest of the repo, and refactor the code so the important behavior is covered by tests instead of staying embedded in one script.

## Proposed approach
- Translate the current dumper into a Node.js CLI with the same core behavior: fetch metas, resolve format/meta, fetch card stats and top-played data, build summary JSON/Markdown, and write the output bundle.
- Split the JS implementation into small testable helpers for HTTP access, cache handling, response validation, format/meta selection, summary building, and markdown generation.
- Add targeted tests for the pure helpers plus mocked I/O tests for the CLI flow so the migration is locked down without depending on live swubase calls.
- Update the prompt/docs to match the JS implementation and the new test strategy.

## Todos
1. Audit the Python script and identify the exact JS module boundaries.
2. Implement the Node.js dumper and wire it into the project scripts.
3. Extract testable pure helpers for summary, markdown, and selection logic.
4. Add/adjust Vitest coverage for helper behavior and mocked CLI I/O.
5. Update the prompt and README/docs to describe the JS workflow.
6. Verify the new implementation against the existing build/test setup.

## Notes
- Assumption: the Python file is a prototype to replace, not something to keep running in parallel.
- The migration should preserve the current output shape unless the tests reveal a clearer fix is needed.
- Testing should focus on deterministic units first, with live network behavior isolated behind mocks or narrow integration checks.
- This is a plan-only phase; no implementation changes yet.
