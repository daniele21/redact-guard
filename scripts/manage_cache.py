import os
import sys
from pathlib import Path

# Add project root and anonimizer directory to path
SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent
sys.path.append(str(ROOT_DIR / "anonimizer"))

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def get_cache_size(path):
    total_size = 0
    if not os.path.exists(path):
        return 0
    for dirpath, dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            try:
                total_size += os.path.getsize(fp)
            except OSError:
                pass
    return total_size / (1024 * 1024) # MB

def main():
    # Change directory to anonimizer FIRST so relative paths in config/cache_manager 
    # resolve to the same location used by the running server
    app_run_dir = ROOT_DIR / "anonimizer"
    os.chdir(app_run_dir)

    # Now we can import internal components safely
    try:
        from cache.cache_manager import cache_manager
        from config import config
        
        cache_base = Path(config.cache.cache_dir)
        # If the path in config is relative, it's now relative to 'anonimizer'
        
    except ImportError as e:
        print(f"\033[91mError: Could not import RedactGuard components ({e}).\033[0m")
        print("Please ensure you are running this script from the project root or via pnpm.")
        return

    while True:
        clear_screen()
        print("\033[95m" + "╔" + "═"*58 + "╗" + "\033[0m")
        print("\033[95m" + "║" + " " * 15 + "REDACTGUARD CACHE MANAGEMENT TOOL" + " " * 16 + "║" + "\033[0m")
        print("\033[95m" + "╚" + "═"*58 + "╝" + "\033[0m")
        
        llm_path = cache_base / "llm"
        pdf_path = cache_base / "pdf"
        
        llm_size = get_cache_size(llm_path)
        pdf_size = get_cache_size(pdf_path)
        
        print(f"\n\033[94m📊 Current Cache Status:\033[0m")
        print(f"  • \033[1mLLM Inference:\033[0m   {llm_size:>8.2f} MB  (Saves LLM responses)")
        print(f"  • \033[1mPDF Processing:\033[0m  {pdf_size:>8.2f} MB  (Saves extracted text)")
        print(f"  • \033[1mTOTAL:\033[0m           {llm_size + pdf_size:>8.2f} MB")
        
        print("\n\033[93m🛠️ Select an action:\033[0m")
        print("  \033[1m1.\033[0m Clear \033[96mLLM Inference\033[0m Cache")
        print("  \033[1m2.\033[0m Clear \033[96mPDF Processing\033[0m Cache")
        print("  \033[1m3.\033[0m Clear \033[91mEVERYTHING\033[0m")
        print("  \033[1m4.\033[0m Exit")
        
        try:
            choice = input("\n\033[1mOption [1-4]: \033[0m")
        except EOFError:
            break
        
        if choice == '1':
            print("\n\033[91m⚠️  IMPACT:\033[0m")
            print("  RedactGuard will have to re-run the LLM model for every page on your next analyze.")
            print("  This will be significantly slower and use more CPU/GPU resources.")
            confirm = input("\n  Confirm clear LLM cache? [y/N]: ")
            if confirm.lower() == 'y':
                cache_manager.clear_llm()
                print("\n\033[92m✅ LLM cache cleared.\033[0m")
                input("  Press Enter to continue...")
        
        elif choice == '2':
            print("\n\033[91m⚠️  IMPACT:\033[0m")
            print("  The system will re-extract text and layout from PDFs on next upload.")
            print("  Usually fast, but will consume storage temporarily during re-parsing.")
            confirm = input("\n  Confirm clear PDF cache? [y/N]: ")
            if confirm.lower() == 'y':
                cache_manager.clear_pdf()
                print("\n\033[92m✅ PDF cache cleared.\033[0m")
                input("  Press Enter to continue...")
                
        elif choice == '3':
            print("\n\033[91m⚠️  IMPACT:\033[0m")
            print("  Full reset. All previously processed documents will require a fresh run.")
            print("  This is like running the application for the first time.")
            confirm = input("\n  Confirm clear ALL caches? [y/N]: ")
            if confirm.lower() == 'y':
                cache_manager.clear_all()
                print("\n\033[92m✅ All caches cleared.\033[0m")
                input("  Press Enter to continue...")
                
        elif choice == '4':
            print("\n\033[94mExiting... Keep your data safe! 🛡️\033[0m\n")
            break
        else:
            print("\n\033[31mInvalid option. Please try again.\033[0m")
            input("  Press Enter to continue...")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n\033[94mInterrupted. Exiting...\033[0m")
        sys.exit(0)
