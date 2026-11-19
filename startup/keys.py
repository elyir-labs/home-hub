#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The keys pressed while the startup splash asks a question (design/move-to-drive/, keys-2: A and C together).

Plymouth 24 reads a USB keyboard through evdev and drops every key that makes no character, so the arrows never
reach the theme or `plymouth watch-keystroke`. It doesn't grab the devices either, so this reads them beside it and
prints one word a line: up, down, tab, enter, back, or a lowercase letter. A mouse wheel is up and down too.
Letters are read by position, as a US keyboard labels them. A device plugged in later is picked up within a second.

    keys.py [input directory]       default /dev/input; HUB_INPUT_DIR also sets it, for the tests
"""
import glob, os, select, struct, sys, time

EVENT = struct.Struct("llHHi")
EV_KEY, EV_REL, REL_WHEEL = 1, 2, 8
SHIFTS = {42, 54}
NAMED = {14: "back", 15: "tab", 28: "enter", 96: "enter", 103: "up", 108: "down", 104: "up", 109: "down"}
ROWS = {16: "qwertyuiop", 30: "asdfghjkl", 44: "zxcvbnm"}
LETTERS = {code + i: ch for code, row in ROWS.items() for i, ch in enumerate(row)}
REPEATS = {"up", "down", "back"}


def word(code: int, value: int, shifted: bool):
    """What a key event means here, or None. value is 1 for a press and 2 for the keyboard's own repeat."""
    if value not in (1, 2):
        return None
    w = NAMED.get(code) or LETTERS.get(code)
    if w == "tab" and shifted:
        w = "up"
    if value == 2 and w not in REPEATS:
        return None
    return w


def main(where: str) -> None:
    out = os.fdopen(sys.stdout.fileno(), "w", buffering=1)
    open_, ended = {}, set()
    shifted = set()
    while True:
        for path in glob.glob(os.path.join(where, "event*")):
            if path not in open_ and path not in ended:
                try:
                    open_[path] = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
                except OSError:
                    pass
        fds = {fd: path for path, fd in open_.items()}
        if not fds:
            time.sleep(1.0)
            continue
        ready = select.select(list(fds), [], [], 1.0)[0]
        for fd in ready:
            try:
                data = os.read(fd, EVENT.size * 64)
            except BlockingIOError:
                continue
            except OSError:
                os.close(fd)
                open_.pop(fds[fd], None)
                continue
            if not data:
                # Only a fifo ends (the tests): a keyboard pulled out is an error, and its replacement is opened again.
                os.close(fd)
                ended.add(fds[fd])
                open_.pop(fds[fd], None)
                continue
            for i in range(0, len(data) - EVENT.size + 1, EVENT.size):
                _, _, kind, code, value = EVENT.unpack_from(data, i)
                if kind == EV_REL and code == REL_WHEEL and value:
                    out.write("up\n" if value > 0 else "down\n")
                elif kind == EV_KEY:
                    if code in SHIFTS:
                        (shifted.add if value else shifted.discard)(code)
                        continue
                    w = word(code, value, bool(shifted))
                    if w:
                        out.write(w + "\n")


if __name__ == "__main__":
    try:
        main(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("HUB_INPUT_DIR", "/dev/input"))
    except (KeyboardInterrupt, BrokenPipeError):
        pass
