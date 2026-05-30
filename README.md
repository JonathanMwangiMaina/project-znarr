# **Project Znarr**

**Project Znarr** is an AI-powered interactive drawing game that challenges users to sketch doodles while advanced vision models attempt to identify the drawing in real-time. Built with React, Express, and integrated with Google Gemini 3.5 Flash and Hugging Face Inference APIs, the application delivers sub-second AI-driven image classification with intelligent fallback mechanisms for maximum reliability.

---

## **Key Features**

* **Real-Time AI Doodle Recognition**: Leverages Google Gemini 3.5 Flash for high-fidelity visual understanding and Hugging Face vision models (BLIP, ViT, ResNet, QuickDraw) for robust multi-model inference with automatic fallback logic.
* **Interactive Drawing Canvas**: Built with React 19 and Motion (Framer Motion) for fluid, responsive user interactions with customizable brush sizes, color palettes, and undo/redo functionality.
* **Challenge-Based Gameplay**: Implements structured drawing prompts with difficulty levels (Easy, Medium, Hard), real-time scoring, streak tracking, and witty AI-generated feedback to enhance user engagement.
* **Intelligent Backend Orchestration**: Express-based API server featuring advanced error handling, DNS resolution optimization for containerized environments, and graceful degradation between multiple AI providers to ensure 99%+ uptime for inference requests.

---

## **Architecture / System Design**

The application follows a **client-server architecture** with clear separation of concerns:

1. **Frontend (React SPA)**: The user interacts with a canvas component built using React 19 and HTML5 Canvas API. Drawing data is captured as base64-encoded PNG images and transmitted to the backend via RESTful API calls (`POST /api/guess`).

2. **Backend (Express + Node.js)**: The server orchestrates AI inference requests with a priority-based fallback mechanism:
   - **Primary**: Google Gemini 3.5 Flash (vision + structured JSON output) for high-quality image-to-text interpretation with custom prompt engineering.
   - **Fallback**: Hugging Face Inference API with sequential model retries across BLIP (image captioning), ViT, ResNet, and Keras QuickDraw classifiers to handle rate limits and model cold starts.
   - **Mock Mode**: Development fallback when API keys are unavailable, ensuring uninterrupted local testing workflows.

3. **Data Flow**: User draws → Canvas captures pixel data → Base64 encoding → HTTP POST → AI model inference (Gemini or HF) → Structured JSON response (`guesses[]`, `description`, `matched`) → UI updates with confidence scores and humorous AI commentary.

4. **Deployment Pipeline**: Vite-powered frontend bundling with automatic production static asset serving. The backend compiles to CommonJS via esbuild for Node.js runtime compatibility in containerized environments (Docker, Cloud Run).

---

## **Prerequisites**

Before running this project, ensure the following dependencies are installed on your system:

* **Node.js** `>= 18.0.0` (LTS recommended)
* **npm** `>= 9.0.0` or **yarn** `>= 1.22.0`
* **API Keys**:
  - **Google Gemini API Key** (Required) – Obtain from [Google AI Studio](https://ai.google.dev/)
  - **Hugging Face API Token** (Optional) – For increased rate limits, available at [Hugging Face Settings](https://huggingface.co/settings/tokens)

---

## **Installation & Setup**

Follow these steps to clone, configure, and run the project locally:

### **1. Clone the Repository**

```bash
git clone https://github.com/JonathanMwangiMaina/project-znarr.git
cd project-znarr
```

### **2. Install Dependencies**

```bash
npm install
```

### **3. Configure Environment Variables**

Create a `.env` file in the project root by copying the provided template:

```bash
cp .env.example .env
```

Edit the `.env` file and add your API keys:

```bash
# GEMINI_API_KEY: Required for Gemini AI API calls
GEMINI_API_KEY=your_gemini_api_key_here

# APP_URL: Application URL (auto-configured in production, use localhost for dev)
APP_URL=http://localhost:3000

# HF_TOKEN: Optional Hugging Face API Token (increases rate limits)
HF_TOKEN=your_huggingface_token_here
```

**Security Note**: Never commit the `.env` file to version control. The `.gitignore` is pre-configured to exclude it.

### **4. Build the Project (Production)**

For production deployment, compile both frontend and backend:

```bash
npm run build
```

This generates optimized static assets in `dist/` and bundles the server into `dist/server.cjs`.

---

## **Usage**

### **Development Mode**

Start the development server with hot module replacement (HMR):

```bash
npm run dev
```

The application will be accessible at `http://localhost:3000`.

**Development Features**:
- Vite-powered instant HMR for React components
- Automatic server restart on `server.ts` changes via `tsx` watch mode
- Source maps for streamlined debugging

### **Production Mode**

After building the project, start the production server:

```bash
npm start
```

This serves the pre-compiled static assets from `dist/` with optimized Express routing.

### **Linting & Type Checking**

Run TypeScript type validation without emitting output:

```bash
npm run lint
```

### **API Endpoints**

* **`GET /api/health`**: Health check endpoint returning server status and timestamp.
* **`POST /api/guess`**: Core doodle recognition endpoint.
  - **Request Body**:
    ```json
    {
      "image": "data:image/png;base64,iVBORw0KG...",
      "targetPrompt": "cat",
      "modelPreference": "gemini"
    }
    ```
  - **Response**:
    ```json
    {
      "success": true,
      "guesses": [
        { "label": "cat", "confidence": 0.92 },
        { "label": "kitten", "confidence": 0.06 }
      ],
      "description": "That's a purrfect sketch of a feline friend!",
      "matched": true,
      "backendUsed": "Gemini"
    }
    ```

---

## **Project Structure**

```
project-znarr/
├── src/
│   ├── components/
│   │   ├── DrawingCanvas.tsx      # HTML5 Canvas drawing component
│   │   └── GameInterface.tsx      # Challenge UI and scoring logic
│   ├── data/
│   │   └── challenges.ts          # Predefined drawing prompts database
│   ├── types.ts                   # TypeScript interfaces (Guess, Challenge, GameStats)
│   ├── App.tsx                    # Root React component
│   └── main.tsx                   # React app entry point
├── server.ts                      # Express backend with AI orchestration
├── vite.config.ts                 # Vite build configuration
├── tsconfig.json                  # TypeScript compiler options
├── package.json                   # Project dependencies and scripts
├── .env.example                   # Environment variable template
└── README.md                      # Project documentation (this file)
```

---

## **Technology Stack**

### **Frontend**
* **React** `19.0.1` – Declarative UI framework with modern Concurrent Rendering
* **TypeScript** `5.8.2` – Type-safe JavaScript with strict null checks
* **Vite** `6.2.3` – Next-generation frontend build tool with instant HMR
* **Tailwind CSS** `4.1.14` – Utility-first CSS framework with JIT compilation
* **Motion** `12.23.24` – Production-ready animation library (Framer Motion successor)
* **Lucide React** `0.546.0` – Modern SVG icon library

### **Backend**
* **Node.js** `>= 18.0.0` – JavaScript runtime with native fetch and DNS APIs
* **Express** `4.21.2` – Minimalist web framework for RESTful API routing
* **Google GenAI SDK** `2.4.0` – Official SDK for Gemini API with structured output support
* **dotenv** `17.2.3` – Environment variable loader
* **tsx** `4.21.0` – TypeScript execution engine for development workflows
* **esbuild** `0.25.0` – High-performance JavaScript bundler

### **AI Models & APIs**
* **Google Gemini 3.5 Flash** – Multimodal AI with vision capabilities and JSON schema validation
* **Hugging Face Inference API** – Fallback models including:
  - Salesforce BLIP (image captioning)
  - Google ViT (Vision Transformer)
  - Microsoft ResNet-50 (residual networks)
  - Keras QuickDraw Classifier (doodle-specific training)

---

## **Deployment**

### **Docker Deployment**

Build and run the application in a containerized environment:

```bash
# Build Docker image
docker build -t project-znarr:latest .

# Run container with environment variables
docker run -d \
  -p 3000:3000 \
  -e GEMINI_API_KEY=your_key_here \
  -e NODE_ENV=production \
  --name znarr-app \
  project-znarr:latest
```

### **Render / Railway Deployment**

The project is production-ready for deployment on cloud platforms:

**Render Deployment:**
1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Configure environment variables in the Render dashboard:
   - `GEMINI_API_KEY`: Your Gemini API key
   - `APP_URL`: Your Render service URL (e.g., `https://your-app.onrender.com`)
   - `HF_TOKEN`: (Optional) Your Hugging Face token
4. Set build command: `npm run build`
5. Set start command: `npm start`
6. Deploy automatically on every push to main branch

**Railway Deployment:**
1. Create a new project on [Railway](https://railway.app)
2. Connect your GitHub repository
3. Add environment variables in Railway dashboard:
   - `GEMINI_API_KEY`: Your Gemini API key
   - `APP_URL`: Your Railway service URL
   - `HF_TOKEN`: (Optional) Your Hugging Face token
4. Railway auto-detects Node.js and runs `npm install` and `npm start`
5. Deploy with zero configuration required

---

## **Contributing**

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/JonathanMwangiMaina/project-znarr/issues) if you want to contribute.

### **Development Workflow**

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## **Acknowledgments**

* **Google AI Studio** – For providing the Gemini 3.5 Flash API and initial project scaffolding
* **Hugging Face** – For open-source vision model access via Inference API
* **Keras QuickDraw Dataset** – For doodle-specific training data and classification models

---

## **License**

This project is open source and available under the MIT License.

---

## **Author**

Developed by **Johnsberg**. Built with fun and AI💫
