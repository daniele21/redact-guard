#!/bin/bash

# Exit on error
set -e

echo "🔍 Checking for Python 3.13..."
if ! command -v python3.13 &> /dev/null; then
    echo "❌ Python 3.13 not found. Please install it (e.g., via brew install python@3.13)"
    exit 1
fi

echo "🚀 Creating virtual environment in .venv..."
python3.13 -m venv .venv

echo "🔄 Activating virtual environment..."
source .venv/bin/activate

echo "⬆️ Upgrading pip..."
pip install --upgrade pip

echo "📦 Installing dependencies from anonimizer/requirements.txt..."

# For Mac M1/M2/M3: Ensure Metal support for llama-cpp-python
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 Mac detected: Installing llama-cpp-python with Metal acceleration..."
    CMAKE_ARGS="-DGGML_METAL=on" pip install --no-cache-dir llama-cpp-python
else
    pip install llama-cpp-python
fi

# Install the rest of the requirements
pip install -r anonimizer/requirements.txt

echo "✅ Setup complete!"
echo "💡 To use the environment, run: source .venv/bin/activate"
echo "🚀 Then you can start everything with: pnpm start"
