Add a friend by username.

First, check if claude-friends is set up by running `claude-friends whoami`. If it returns "Not set up", run the onboarding flow described in the /friends command BEFORE doing anything else.

If set up: run `claude-friends add $ARGUMENTS` and show the output. If no username is provided, ask for one using AskUserQuestion.

Remind the user that friendship is mutual — their friend needs to add them back to see each other online.
