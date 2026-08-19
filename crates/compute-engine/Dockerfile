FROM rust:1.85-slim-bookworm AS builder
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates/compute-engine/ crates/compute-engine/
COPY crates/agent-safety/ crates/agent-safety/
RUN cargo build --release --package compute-engine

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates libssl3 curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/libcompute_engine.so /usr/lib/
EXPOSE 8190
HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD curl -f http://localhost:8190/health || exit 1
CMD ["compute-engine"]
