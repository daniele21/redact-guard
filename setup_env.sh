#!/bin/bash
set -e

echo "🔍 Checking for Python 3.13..."
if ! command -v python3.13 &> /dev/null; then
    echo "❌ Python 3.13 not found. Please install it (e.g. brew install python@3.13)"
    exit 1
fi

echo "🚀 Creating virtual environment in .venv..."
python3.13 -m venv .venv

echo "🔄 Activating virtual environment..."
source .venv/bin/activate

echo "⬆️ Upgrading pip..."
pip install --upgrade pip

echo "📦 Installing RedactGuard backend dependencies..."
pip install -r anonimizer/requirements.txt

echo "✅ RedactGuard environment ready."
echo "ℹ️  Korgis is an external local runtime and is not installed or embedded by this script."
echo "💡 Start Korgis separately, then run: pnpm start"
