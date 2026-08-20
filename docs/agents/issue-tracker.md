# Issue tracker: GitHub

Issues and specs for this repository live as GitHub issues. Use the `gh` CLI for issue operations.

## Conventions

- Create an issue with `gh issue create --title "..." --body "..."`.
- Read an issue with `gh issue view <number> --comments`.
- List issues with `gh issue list` and request the labels and comments needed by the task.
- Comment with `gh issue comment <number> --body "..."`.
- Add or remove labels with `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close an issue with `gh issue close <number> --comment "..."`.

The configured remote is `github-dniprodev.com:dniprodev/family-board.git`, which
maps to the GitHub repository `dniprodev/family-board`. If `gh` cannot infer the
custom host, pass `--repo dniprodev/family-board` explicitly.

## Pull requests as a triage surface

No. Pull requests are not treated as incoming feature requests by triage.

## Publishing and fetching

When a skill says to publish to the issue tracker, create a GitHub issue. When it says to fetch a ticket, run `gh issue view <number> --comments`.
