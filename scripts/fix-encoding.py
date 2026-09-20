#!/usr/bin/env python3
"""
Repare le double-encodage (mojibake) du repo.

Cause : du texte deja en UTF-8 a ete relu comme du Windows-1252 puis
reecrit en UTF-8 -> "e accent" devient "A-tilde ©", "..." devient "a-circo EUR ...",
l'emoji d'avertissement devient une suite illisible.

Le fichier reste du UTF-8 techniquement valide, donc ni Git ni l'editeur
ne signalent quoi que ce soit : seul le rendu est casse.

Usage (a la racine du repo) :
    pip install ftfy
    python scripts/fix-encoding.py            # apercu seulement
    python scripts/fix-encoding.py --write    # applique les corrections
"""

import os
import subprocess
import sys

import ftfy

WRITE = "--write" in sys.argv

SKIP_DIRS = (".git/", "node_modules/")
# probe2.txt contient volontairement du Latin-1 : ne pas y toucher.
SKIP_FILES = ("public/icons/probe2.txt",)


def tracked_files():
    out = subprocess.check_output(["git", "ls-files"]).decode("utf-8", "surrogateescape")
    for f in out.split("\n"):
        if f and os.path.isfile(f) and not f.startswith(SKIP_DIRS) and f not in SKIP_FILES:
            yield f


def main():
    total = 0
    for path in tracked_files():
        raw = open(path, "rb").read()
        if b"\x00" in raw[:4096]:  # binaire
            continue
        try:
            src = raw.decode("utf-8")
        except UnicodeDecodeError:
            print(f"[!] {path} : octets non-UTF-8, a inspecter a la main")
            continue

        fixed = ftfy.fix_encoding(src)
        if fixed == src:
            continue

        n = sum(1 for a, b in zip(src.split("\n"), fixed.split("\n")) if a != b)
        total += 1
        print(f"[{'FIX' if WRITE else 'DRY'}] {path} : {n} lignes")

        if WRITE:
            with open(path, "w", encoding="utf-8", newline="") as fh:
                fh.write(fixed)

    if total == 0:
        print("Aucun mojibake detecte.")
    elif not WRITE:
        print(f"\n{total} fichier(s) a corriger. Relance avec --write pour appliquer.")


if __name__ == "__main__":
    main()
