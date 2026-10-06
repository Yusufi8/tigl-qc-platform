# Jira import (ITOPS)
8 epics, 57 stories, 229 points. Jira → Settings → System → External system import → CSV.
- Map `Issue Type`, `Summary`, `Description`, `Story Points`, `Labels`, `Priority`.
- Company-managed project: map `Epic Name` → Epic Name and `Epic Link` → Epic Link.
- Team-managed project: import epics first, then map `Epic Link` → **Parent** using the epic keys created.
Story points are planning placeholders; re-estimate in sprint 0.
