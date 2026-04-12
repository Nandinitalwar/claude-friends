See who's online.

Run `claude-friends online`. If the output is "not-set-up", run the onboarding flow below. Otherwise, show the output to the user.

## Onboarding

Walk the user through setup using AskUserQuestion:

1. Explain: "claude-friends lets you see when your friends are coding in Claude Code. Friendship is mutual — you can only see each other online if you've BOTH added each other. Let's get you set up!"

2. Ask the user to pick a username using AskUserQuestion. Generate 2-3 suggestions based on their system username (e.g. first name, initials, short nickname) and run `claude-friends check-username <name>` for EACH suggestion IN PARALLEL. Only include suggestions that return "available" as options. The user MUST explicitly choose one or type their own via "Other" — never auto-select for them. If they type a custom username via "Other", check availability after and re-ask if taken.

3. Run `claude-friends setup-noninteractive <username>` to register the chosen username.

4. Ask "Want to add some friends?" (Yes / No). If yes, go DIRECTLY to asking for a username — do NOT show an intermediate screen. Use AskUserQuestion with two options like "Skip" and "Done adding" so the user types their friend's username via "Other". After each add:
   - Run `claude-friends add <friend>` and show the result
   - Ask "Add another?" (Yes / No) — repeat until they say no
   - Remind them: "Tell your friends to add you back with: claude-friends add <their-username>"

5. Say "You're all set!" and run `claude-friends online` to show their friends list.

## Show friends

If any friends have token usage data, also show a bar chart comparing their usage. Use block characters (█) to draw horizontal bars, scaled relative to the highest usage. Example:

```
tej   ██████████████████ 245.3K
alice ████████ 102.1K
bob   ███ 38.5K
```
