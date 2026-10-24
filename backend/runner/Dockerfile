FROM python:3.12-slim
RUN pip install --no-cache-dir pytest==8.3.3 pytest-cov==5.0.0
RUN useradd --create-home --uid 10001 runner
USER 10001:10001
WORKDIR /work
ENTRYPOINT ["python", "-m"]
CMD ["pytest", "--version"]
