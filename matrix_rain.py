"""
Matrix Digital Rain
===================
A lightweight terminal-based Matrix digital rain animation using ANSI escape codes.
Run with: python matrix_rain.py
Press Ctrl+C to exit.
"""

import os
import random
import shutil
import sys
import time

# Characters used for the digital stream
CHARS = "0123456789ABCDEFabcdef!@#$%^&*+-=/<>:;|~"

# ANSI color codes
BRIGHT_GREEN = "\033[1;92m"
GREEN = "\033[0;32m"
DARK_GREEN = "\033[2;32m"
WHITE = "\033[1;97m"
RESET = "\033[0m"
CLEAR_SCREEN = "\033[2J\033[H"
HIDE_CURSOR = "\033[?25l"
SHOW_CURSOR = "\033[?25h"


def get_terminal_dimensions():
    """Return the current column and row dimensions of the terminal."""
    try:
        size = shutil.get_terminal_size(fallback=(80, 24))
        return size.columns, size.lines
    except Exception:
        return 80, 24


def run_matrix(duration_seconds=None):
    """Run the Matrix digital rain animation loop."""
    cols, rows = get_terminal_dimensions()

    # Drop positions for each column (negative values create staggered entries)
    drops = [random.randint(-rows, 0) for _ in range(cols)]

    # Enable ANSI escape sequences on Windows console if possible
    os.system("")

    sys.stdout.write(HIDE_CURSOR)
    sys.stdout.write(CLEAR_SCREEN)
    sys.stdout.flush()

    start_time = time.time()

    try:
        while True:
            # Check if duration limit is reached (if specified)
            if duration_seconds and (time.time() - start_time) > duration_seconds:
                break

            current_cols, current_rows = get_terminal_dimensions()
            if current_cols != cols:
                cols = current_cols
                rows = current_rows
                drops = [random.randint(-rows, 0) for _ in range(cols)]

            line_chars = []
            for col in range(cols):
                y = drops[col]

                # Random chance to emit a character or empty space
                if y >= 0 and random.random() > 0.15:
                    char = random.choice(CHARS)
                    # Lead characters are bright white, trailing ones are green
                    if random.random() < 0.1:
                        line_chars.append(f"{WHITE}{char}{RESET}")
                    elif random.random() < 0.4:
                        line_chars.append(f"{BRIGHT_GREEN}{char}{RESET}")
                    else:
                        line_chars.append(f"{GREEN}{char}{RESET}")
                else:
                    line_chars.append(" ")

                # Advance drop position; reset to top with random delay once bottom is passed
                drops[col] += 1
                if drops[col] > rows and random.random() > 0.85:
                    drops[col] = random.randint(-15, 0)

            sys.stdout.write("".join(line_chars) + "\n")
            sys.stdout.flush()
            time.sleep(0.04)

    except KeyboardInterrupt:
        pass
    finally:
        sys.stdout.write(SHOW_CURSOR)
        sys.stdout.write(RESET)
        sys.stdout.flush()
        print("\n[Exited the Matrix]")


if __name__ == "__main__":
    run_matrix()
