# Nora
NodeJS R/a/dio Archiver

Made to poll r-a-d.io until a human DJ comes online, and to begin recording their stream. Unlike other npm radio downloaders, this one will split based on the name and tag the stream as an album using the DJ's name and timestamp. This has been specially tailored for the setup that r/a/dio uses so it will probably not work with other internet radio streams.

To use make sure you have the packages installed and run node nora.ts and you should be good to go.

There are a few variables that can be changed for this:
- poll_interval
- excluded_djs
- output_folders
Though output_folders hasn't been tested (it's probably broken) so it's best to leave these at default.

Nai, the complimenting UI to this project manages many of the safe value changes so there's no real need to mess around with them.