# Personal Dark Army profile: static page plus one function

`profile/web-static-vercel/` is a Dark Army agent-pack profile of your own for
a static page with a few Node functions on Vercel (npm, `node --test`, no
database, no framework). It is written generically so any project of that shape
can adopt it; this folder is the source of truth.

Dark Army reads personal profiles from `~/.dark-army/profiles/<id>/`, and its
renderer refuses a symlink, so that location holds a **copy**. To install or
refresh it, run this from the project folder:

```
mkdir -p ~/.dark-army/profiles && rm -rf ~/.dark-army/profiles/web-static-vercel && cp -R profile/web-static-vercel ~/.dark-army/profiles/
```

Then switch the project in Dark Army's panel: the project row, **Install agent
pack**, the row labelled **Static page + one function**. `bash profile/render-check.sh`
renders the profile with Dark Army's own renderer into `test-output/profile-render/`
and prints `profile: ok` when it describes the right project.
