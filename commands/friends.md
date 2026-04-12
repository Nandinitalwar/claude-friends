See who's online.

First, check if claude-friends is set up by running `claude-friends whoami`. If it returns "Not set up", run the onboarding flow below BEFORE doing anything else. If it IS set up, skip to "Show friends".

## Onboarding (only if not set up)

Walk the user through setup using AskUserQuestion:

1. Explain: "claude-friends lets you see when your friends are coding in Claude Code. Friendship is mutual — you can only see each other online if you've BOTH added each other."

2. Before asking the user to pick a username, generate 2-3 suggestions based on their system username (e.g. first name, initials, short nickname). Run `claude-friends check-username <name>` for EACH suggestion IN PARALLEL to check availability. Only include suggestions that return "available" as options in the AskUserQuestion. This way every option shown is guaranteed available. If the user types their own via "Other", run the check after — if taken, tell them immediately and re-ask.

3. Run `claude-friends setup-noninteractive <username>` to register the chosen username. 

4. Ask "Want to add some friends?" (Yes / No). If yes, go DIRECTLY to asking for a username — do NOT show an intermediate screen. Use AskUserQuestion with two options like "Skip" and "Done adding" so the user types their friend's username via "Other". After each add:
   - Run `claude-friends add <friend>` and show the result
   - Ask "Add another?" (Yes / No) — repeat until they say no
   - Remind them: "Tell your friends to add you back with: claude-friends add <their-username>"

5. Say "You're all set!" and continue to Show friends below.

## Show friends

Run `claude-friends online` and show the output.

If any friends have token usage data, also show a bar chart comparing their usage. Use block characters (█) to draw horizontal bars, scaled relative to the highest usage. Example:

```
tej   ██████████████████ 245.3K
alice ████████ 102.1K
bob   ███ 38.5K
```
