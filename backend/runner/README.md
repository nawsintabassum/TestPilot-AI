# Isolated runner image
Build from the repository root:
`docker build -t testpilot-runner:local -f backend/runner/Dockerfile backend/runner`

The API starts this image with no network, read-only root, dropped capabilities, non-root user, resource limits, a timeout, and a read-only mounted work directory. Review the Docker daemon trust boundary before enabling execution. The starter does not install arbitrary project dependencies.
