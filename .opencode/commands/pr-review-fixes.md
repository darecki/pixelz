---
description: Fetch PR comments and apply fixes
agent: build
---
You are handling PR review fixes for the PR attached to the current branch.

PR metadata:
!`gh pr view --json number,title,url,headRefName,baseRefName,state`

General PR comments (high-level discussion):
!`gh pr view --comments`

Line-level review comments (all pages):
!`gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pulls/$(gh pr view --json number -q .number)/comments" --paginate --jq '.[] | "ID: \(.id) | File: \(.path) | Line: \(.line // .original_line // \"n/a\") | Author: \(.user.login) | URL: \(.html_url)\n\(.body)\n---"'`

Task:
1) Identify actionable engineering feedback for this branch.
2) Ignore bot noise unless it indicates a real failure.
3) De-duplicate overlapping comments.
4) Apply code fixes that address the comments.
5) Run targeted validation for changed code.
6) Return:
   - addressed comments (ID or URL -> fix)
   - comments intentionally skipped (with reason)
   - validation results

If there are no actionable review comments, report that and stop.

Optional focus from user: $ARGUMENTS
