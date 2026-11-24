Intel PresentMon console application (v2.6.1, MIT license, Copyright Intel Corporation).
https://github.com/GameTechDev/PresentMon

PresentMon.exe is downloaded from the official GitHub release and its Intel Authenticode
signature is verified by the CI build (.github/workflows/build-windows.yml). It is not committed
to this repository. FRISTY uses it only to read frame-rate (FPS) data via Windows ETW tracing;
it does not inject into games.
