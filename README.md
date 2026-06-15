# Simple Media Converter Backend

A robust, high-performance Express & TypeScript backend service for converting media files (video, audio, and images) using FFmpeg, MongoDB, and Server-Sent Events (SSE) for real-time progress tracking.

---

## Table of Contents
1. [Key Features](#key-features)
2. [Prerequisites](#prerequisites)
3. [Installation & Setup](#installation--setup)
4. [Environment Variables](#environment-variables)
5. [Running the Application](#running-the-application)
6. [Linter & Code Quality](#linter--code-quality)

---

## Key Features

- **Google OAuth Integration**: Secure authentication with Google Sign-In and JWT-based session authorization.
- **Media Conversion Engine**: Seamless conversions for 20+ media formats (video, audio, image) using native FFmpeg child processes.
- **Real-time Progress Updates**: Server-Sent Events (SSE) stream live conversion percentage and status transitions to the client.
- **Efficient File Management**: Automatic cleanup of source files upon successful conversion or job failure, and custom limits (up to 1GB uploads).
- **Structured Logging**: Production-ready logging using Pino and Pino-pretty for development.
- **Graceful Shutdown**: Safe closing of MongoDB connections and clean process exits.

---

## Prerequisites

Ensure you have the following installed on your system:

- **Node.js**: `v18.x` or higher (tested on `v25.x` and `v18.x`)
- **MongoDB**: A local MongoDB database instance or a remote [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster.
- **FFmpeg & FFprobe**: Must be installed and configured in your system `PATH` (used for transcoding and duration detection).

---

## Installation & Setup

1. **Clone the Repository & Install Dependencies**:
   ```bash
   git clone <repository-url>
   cd simple-converter-backend
   npm install
   ```

2. **Configure Environment Variables**:
   Copy the example environment file and fill in your values:
   ```bash
   cp .env.example .env
   ```
   *For details on each variable, see the [Environment Variables](#environment-variables) section below.*

3. **Verify FFmpeg Installation**:
   Ensure `ffmpeg` is available globally in your command line:
   ```bash
   ffmpeg -version
   ffprobe -version
   ```

4. **Run the Server**:
   Start the development server with hot-reloading:
   ```bash
   npm run dev
   ```

---

## Environment Variables

The application reads configurations from `.env`. Below are the supported environment variables:

| Variable | Description | Example / Default | Required |
| :--- | :--- | :--- | :---: |
| `PORT` | The port number on which the API server listens. | `3000` | Yes |
| `FRONTEND_URL` | The URL of the frontend client (for CORS configuration). | `http://localhost:5173` | Yes |
| `JWT_SECRET` | A secret string used to sign and verify JSON Web Tokens. | `your_secret_key_here` | Yes |
| `NODE_ENV` | Application environment (`dev` or `prod`). Determines DB name and file storage roots. | `dev` | Yes |
| `MONGODB_URI` | The connection string for your MongoDB instance. | `mongodb://localhost:27017/db` | Yes |
| `GOOGLE_CLIENT_ID`| The OAuth 2.0 Client ID generated in Google Cloud Console. | `xxxx.apps.googleusercontent.com` | Yes |

### File Storage Roots
Depending on the `NODE_ENV` configuration, the directories where files are temporarily stored behave differently:
- **`dev` environment**: Uploaded files (`_uploads/`) and converted files (`_outputs/`) are saved in the project's root folder (`process.cwd()`).
- **`prod` environment**: Files are written to `/var/tmp/_uploads` and `/var/tmp/_outputs` for compatibility with server environments.

### Database Selection
- If `NODE_ENV` is set to `prod`, the MongoDB database name used is `main`.
- For any other environment (e.g., `dev`), the database name defaults to `dev`.

---

## Running the Application

In `package.json`, several npm scripts are defined to run and build the application:

```bash
# 1. Run local development server (with tsx hot-reloading)
npm run dev

# 2. Build TypeScript source files for production compilation
npm run build

# 3. Run the compiled JavaScript production server
npm start
```

### Compiling to JavaScript
The compilation script utilizes `tsc` for TypeScript compilation and `tsc-alias` to resolve local path mappings (such as `@/` aliases defined in `tsconfig.json`) into valid production paths inside the `dist/` directory.

---

## Linter & Code Quality

To keep the codebase clean, type-safe, and formatted consistently:

```bash
# Analyze project structure and lint issues
npm run lint

# Automatically resolve fixing lint rules where possible
npm run lint:fix
```

Rules are configured in:
- `eslint.config.js` for TypeScript static code analysis
- `.prettierrc` for code formatting settings
- `.editorconfig` for cross-editor configuration consistency
