# Builder Image
# ---------------------------------------------------
FROM golang:1.25-alpine AS go-builder

WORKDIR /usr/src/app

# Optimasi Cache: Copy file dependency dulu
COPY go.mod go.sum ./
RUN go mod download

# Baru copy source code sisanya
COPY . .

# Batasi paralel build (-p=1) agar CPU/RAM lebih ringan di mesin kecil
ENV GOFLAGS="-p=1"

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -a -o main cmd/main/main.go


# Final Image
# ---------------------------------------------------
FROM dimaskiddo/alpine:base-glibc
MAINTAINER Dimas Restu Hidayanto <dimas.restu@student.upi.edu>

ARG SERVICE_NAME="gowam-rest"

ENV PATH $PATH:/usr/app/${SERVICE_NAME}

WORKDIR /usr/app/${SERVICE_NAME}

RUN apk --no-cache --update upgrade \
    && mkdir -p {.bin/webp,dbs} \
    && chmod 775 {.bin/webp,dbs}

COPY --from=go-builder /usr/src/app/.env.example ./.env
COPY --from=go-builder /usr/src/app/main ./gowam-rest

EXPOSE 3001

VOLUME ["/usr/app/${SERVICE_NAME}/dbs"]
CMD ["gowam-rest"]
