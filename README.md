# Simple Media Converter Backend

A robust, high-performance Express & TypeScript backend service for converting media files (video, audio, and images) using FFmpeg, BullMQ, Redis, AWS S3, MongoDB, and WebSockets for real-time progress tracking.

---

## Table of Contents
1. [Key Features](#key-features)
2. [Prerequisites](#prerequisites)
3. [Installation & Setup](#installation--setup)
4. [Environment Variables](#environment-variables)
5. [Running the Application](#running-the-application)
6. [Deployment to Render (Free Tier)](#deployment-to-render-free-tier)
7. [Docker & Local Containers](#docker--local-containers)
8. [Linter & Code Quality](#linter--code-quality)

---

## Key Features

- **Google OAuth Integration**: Secure authentication with Google Sign-In and JWT-based session authorization.
- **Media Conversion Engine**: Conversions across 20+ media formats (video, audio, image) using FFmpeg child processes and BullMQ job processing.
- **Unified & Scalable Worker Architecture**: Runs seamlessly in a single process/container for free-tier deployments or scales to dedicated worker instances.
- **Real-time Progress Updates**: WebSocket streams live conversion progress percentages and status transitions to clients.
- **AWS S3 Cloud Storage**: Secure presigned upload/download URLs and object persistence in Amazon S3.
- **Structured Logging**: Production-ready JSON logging using Pino, and pretty-printed formatted output for local development.
- **Graceful Shutdown**: Safe closing of MongoDB connections, Redis subscribers, and worker child processes.

---

## Prerequisites

Ensure you have the following installed on your system:

- **Node.js**: `v18.x` or higher (tested on `v20.x` and `v22.x`)
- **MongoDB**: A local MongoDB database instance or a remote [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster (with Replica Set / Change Streams support).
- **Redis**: A Redis instance (e.g., [Upstash Redis](https://upstash.com) or Render Redis) for BullMQ queue management.
- **FFmpeg & FFprobe**: Must be installed and configured in your system `PATH` (already included in the production Docker image).
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

4. **Run the Development Server**:
   Start the application (API and embedded BullMQ worker):
   ```bash
   npm run dev
   ```

---

## Environment Variables

The application reads configuration from environment variables or a `.env` file:

| Variable | Description | Example / Default | Required |
| :--- | :--- | :--- | :---: |
| `PORT` | Port number on which the API server listens. | `3000` (or injected by Render) | Yes |
| `FRONTEND_URL` | URL of the frontend client (for CORS configuration). | `https://your-frontend.vercel.app` | Yes |
| `JWT_SECRET` | Secret key used to sign and verify JSON Web Tokens. | `your_secret_key_here` | Yes |
| `NODE_ENV` | Environment (`dev`, `prod`, or `production`). | `production` | Yes |
| `RUN_WORKER` | Run the BullMQ worker inside the same process. | `true` | No |
| `MONGODB_URI` | MongoDB connection string (e.g. Atlas cluster). | `mongodb+srv://...` | Yes |
| `AWS_ACCESS_KEY_ID` | AWS IAM Access Key ID. | `AKIA...` | Yes |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM Secret Access Key. | `your_secret_access_key` | Yes |
| `AWS_S3_BUCKET_NAME` | Name of your AWS S3 bucket. | `simple-converter-bucket` | Yes |
| `AWS_REGION` | AWS Region where the S3 bucket is hosted. | `eu-central-1` | Yes |
| `REDIS_URL` | Redis connection URL for BullMQ. | `rediss://default:...@...upstash.io:6379` | Yes |
| `REDIS_CLUSTER_ENABLED` | Set `true` if connecting to a Redis Cluster. | `false` | No |
| `WORKER_CONCURRENCY` | Maximum concurrent conversion jobs per worker. | `1` | No |

---

## Deployment to Render (Free Tier)

You can deploy the entire backend stack (API server + WebSocket + FFmpeg Worker) on Render's **Free Tier** using a single Docker Web Service.

### Step-by-Step Instructions

1. **Push your code to GitHub / GitLab**.
2. **Open Render Dashboard**: Go to [dashboard.render.com](https://dashboard.render.com) and click **New +** > **Web Service**.
3. **Connect Repository**: Select your repository.
4. **Configure Service Settings**:
   - **Name**: `simple-converter-backend` (or your preferred name)
   - **Region**: Frankfurt (or closest to your AWS S3 bucket)
   - **Language / Runtime**: **Docker**
   - **Dockerfile Path**: `./Dockerfile`
   - **Instance Type**: **Free**
5. **Add Environment Variables**:
   Under **Environment Variables**, add the following keys:
   - `NODE_ENV` = `production`
   - `RUN_WORKER` = `true`
   - `FRONTEND_URL` = `https://<your-frontend-url>`
   - `JWT_SECRET` = `<your-random-jwt-secret>`
   - `MONGODB_URI` = `<your-mongodb-atlas-uri>`
   - `AWS_ACCESS_KEY_ID` = `<your-aws-access-key-id>`
   - `AWS_SECRET_ACCESS_KEY` = `<your-aws-secret-access-key>`
   - `AWS_S3_BUCKET_NAME` = `<your-s3-bucket-name>`
   - `AWS_REGION` = `eu-central-1`
   - `REDIS_URL` = `<your-redis-connection-url>` (e.g. from [Upstash](https://upstash.com))
   - `REDIS_CLUSTER_ENABLED` = `false`
6. **Health Check Path**:
   Under **Advanced Settings**, set **Health Check Path** to `/api/v1/health`.
7. **Deploy**:
   Click **Create Web Service**. Render will automatically build the Docker image (with Node 20 and FFmpeg) and boot both the API and worker inside the free instance.

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
# Run local API development server (with embedded worker)
npm run dev

# Run standalone worker in dev mode (optional)
npm run dev:worker

# Compile TypeScript for production
npm run build

# Start production server
npm start
```

---

## Linter & Code Quality

```bash
# Check code style and type rules
npm run lint

# Automatically resolve fixing lint rules
npm run lint:fix
```
