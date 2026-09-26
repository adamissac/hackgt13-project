# Git cheat sheet (the only commands you need this weekend)

Start of every work session:
    git pull --rebase

Save your work (do this every 30-60 minutes when something works):
    git status                     # see what changed
    git add .                      # stage everything
    git commit -m "short description of what you did"
    git pull --rebase              # get teammates' work first
    git push                       # upload

If `git pull --rebase` says CONFLICT:
    1. Open the file it names. Look for <<<<<<< ======= >>>>>>> markers.
    2. Keep the right code, delete the markers.
    3. git add <that file>
    4. git rebase --continue
    If stuck: `git rebase --abort` puts you back where you were. Then ask a teammate.

Never: commit `.env`, run `git push --force`, or edit someone else's folder without telling them.
