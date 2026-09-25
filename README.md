# Simple Media Converter Backend

A robust, high-performance Express & TypeScript backend service for converting media files (video, audio, and images) using FFmpeg, BullMQ, Redis, AWS S3, MongoDB, and WebSockets for real-time progress tracking.

---

## Table of Contents
1. [Key Features](#key-features)
2. [Prerequisites](#prerequisites)
3. [Installation & Setup](#installation--setup)
4. [Environment Variables](#environment-variables)
5. [Running the Application](#running-the-application)
6. [Deployment to Render Cloud](#deployment-to-render-cloud)
7. [Docker & Local Containers](#docker--local-containers)
8. [Linter & Code Quality](#linter--code-quality)

---

## Key Features

- **Google OAuth Integration**: Secure authentication with Google Sign-In and JWT-based session authorization.
- **Media Conversion Engine**: Conversions across 20+ media formats (video, audio, image) using FFmpeg child processes and BullMQ job processing.
- **Background Worker Architecture**: Dedicated worker processes handling long-running transcoding tasks without blocking API requests.
- **Real-time Progress Updates**: WebSocket streams live conversion progress percentages and status transitions to clients.
- **AWS S3 Cloud Storage**: Secure presigned upload/download URLs and object persistence in Amazon S3.
- **Structured Logging**: Production-ready JSON logging using Pino, and pretty-printed formatted output for local development.
- **Graceful Shutdown**: Safe closing of MongoDB connections, Redis subscribers, and worker child processes.

---

## Prerequisites

Ensure you have the following installed on your system:

- **Node.js**: `v18.x` or higher (tested on `v20.x` and `v22.x`)
- **MongoDB**: A local MongoDB database instance or a remote [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster (with Replica Set / Change Streams support).
- **Redis**: A Redis server (`v6.0+`) for BullMQ queue management.
- **FFmpeg & FFprobe**: Must be installed and configured in your system `PATH`.
- **AWS S3**: An S3 bucket and AWS IAM credentials with S3 read/write permissions.

---

## Installation & Setup

1. **Clone the Repository & Install Dependencies**:
   ```bash
   git clone <repository-url>
   cd simple-converter-backend
   npm install
   ```

2. **Configure Environment Variables**:
   Copy the example environment file and fill in your credentials:
   ```bash
   cp .env.example .env
   ```
   *For details on each variable, see the [Environment Variables](#environment-variables) section below.*

3. **Verify FFmpeg Installation**:
   Ensure `ffmpeg` and `ffprobe` are available globally:
   ```bash
   ffmpeg -version
   ffprobe -version
   ```

4. **Run the Development Servers**:
   Start the API server:
   ```bash
   npm run dev
   ```
   In a separate terminal, start the background worker:
   ```bash
   npm run dev:worker
   ```

---

## Environment Variables

The application reads configuration from environment variables or a `.env` file:

| Variable | Description | Example / Default | Required |
| :--- | :--- | :--- | :---: |
| `PORT` | Port number on which the API server listens. | `3000` (or `10000` on Render) | Yes |
| `FRONTEND_URL` | URL of the frontend client (for CORS configuration). | `http://localhost:5173` | Yes |
| `JWT_SECRET` | Secret key used to sign and verify JSON Web Tokens. | `your_secret_key_here` | Yes |
| `NODE_ENV` | Environment (`dev`, `prod`, or `production`). | `dev` | Yes |
| `MONGODB_URI` | MongoDB connection string (e.g. Atlas cluster). | `mongodb+srv://...` | Yes |
| `AWS_ACCESS_KEY_ID` | AWS IAM Access Key ID. | `AKIA...` | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM Secret Access Key. | `your_secret_access_key` | Yes |
| `AWS_S3_BUCKET_NAME` | Name of your AWS S3 bucket. | `simple-converter-bucket` | Yes |
| `AWS_REGION` | AWS Region where the S3 bucket is hosted. | `eu-central-1` | Yes |
| `REDIS_URL` | Redis connection URL for BullMQ. | `redis://localhost:6379` | Yes |
| `REDIS_CLUSTER_ENABLED` | Set `true` if connecting to a Redis Cluster. | `false` | No |
| `WORKER_CONCURRENCY` | Maximum concurrent conversion jobs per worker instance. | `1` (or `2` in production) | No |

---

## Deployment to Render Cloud

The repository includes a ready-to-use Render Blueprint definition in [`render.yaml`](file:///render.yaml).

### Automated Blueprint Deployment

1. Push your repository to GitHub or GitLab.
2. Log in to your [Render Dashboard](https://dashboard.render.com).
3. Click **New +** and select **Blueprint**.
4. Connect this repository and select the target branch.
5. Render will detect [`render.yaml`](file:///render.yaml) and automatically create:
   - **`simple-converter-redis`**: Managed Redis instance for BullMQ queue orchestration.
   - **`simple-converter-api`**: Web Service running the Express + WebSocket server with Docker.
   - **`simple-converter-worker`**: Background Worker running the FFmpeg conversion queue with Docker.
6. When prompted in the Render Dashboard, supply the sensitive environment variables marked as `sync: false`:
   - `MONGODB_URI`
   - `FRONTEND_URL`
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_S3_BUCKET_NAME`
7. Render will build the Docker container and start both services.

---

## Docker & Local Containers

You can run the complete backend stack locally using Docker:

```bash
# Build and run the API and worker containers
docker compose up --build -d

# View service logs
docker compose logs -f
```

---

## Running the Application

```bash
# Run local API development server
npm run dev

# Run local worker development server
npm run dev:worker

# Compile TypeScript for production
npm run build

# Start production API server
npm start

# Start production worker
npm run start:worker
```

---

## Linter & Code Quality

```bash
# Check code style and type rules
npm run lint

# Automatically resolve fixing lint rules
npm run lint:fix
```
