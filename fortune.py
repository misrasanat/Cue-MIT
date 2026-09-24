import random
import time

FORTUNES = [
    "Your code will compile on the first try today (suspiciously).",
    "A bug you fixed three months ago will send a postcard.",
    "Today is a great day to delete 200 lines of code and feel like a hero.",
    "Beware of missing semicolons in languages that don't even use them.",
    "The cache will invalidate itself precisely when you need it most.",
    "You will find the answer on the second page of Google search results.",
    "A feature you thought was broken was actually just user error.",
    "Git will merge without conflict today. Celebrate immediately.",
    "Your coffee will kick in at the exact moment inspiration strikes.",
    "Trust the recursion. It knows where it is going.",
]

LUCKY_ITEMS = [
    "Rubber duck with shades",
    "Mechanical keyboard switch",
    "Half-eaten bagel",
    "A clean git rebase",
    "Unopened cold brew",
    "A self-documenting variable name",
]


def main():
    print("\n🔮 Shuffling the cosmic developer deck...\n")
    time.sleep(0.4)

    roll = random.randint(1, 20)
    fortune = random.choice(FORTUNES)
    lucky_item = random.choice(LUCKY_ITEMS)
    lucky_number = random.randint(1, 100)

    print("=" * 50)
    print("           ✨ TODAY'S TECH FORTUNE ✨")
    print("=" * 50)
    print(f"🎲 D20 Luck Roll : {roll}/20", end="")
    if roll == 20:
        print(" (NATURAL 20! Critical success!)")
    elif roll == 1:
        print(" (NAT 1... commit your work now.)")
    else:
        print()

    print(f"📜 Fortune       : {fortune}")
    print(f"🍀 Lucky Item    : {lucky_item}")
    print(f"🔢 Lucky Number  : {lucky_number}")
    print("=" * 50 + "\n")


if __name__ == "__main__":
    main()
