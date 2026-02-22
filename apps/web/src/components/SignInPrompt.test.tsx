import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SignInPrompt from "./SignInPrompt";
import { STORAGE_KEYS } from "../lib/api";

describe("SignInPrompt", () => {
  const storage: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(storage)) delete storage[key];
    Object.defineProperty(global, "localStorage", {
      value: {
        getItem: (key: string) => storage[key] ?? null,
        setItem: (key: string, value: string) => {
          storage[key] = value;
        },
        removeItem: (key: string) => {
          delete storage[key];
        },
      },
      writable: true,
    });
  });

  it("calls onSignIn without persisting when checkbox is unchecked", async () => {
    const onSignIn = vi.fn();
    const onSkip = vi.fn();
    const user = userEvent.setup();

    render(<SignInPrompt rank={7} onSignIn={onSignIn} onSkip={onSkip} />);

    await user.click(screen.getByRole("button", { name: /sign in to save score/i }));

    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.dontRemindSignin)).toBeNull();
  });

  it("persists do-not-remind flag when signing in with checkbox checked", async () => {
    const onSignIn = vi.fn();
    const onSkip = vi.fn();
    const user = userEvent.setup();

    render(<SignInPrompt rank={2} onSignIn={onSignIn} onSkip={onSkip} />);

    await user.click(screen.getByRole("checkbox", { name: /don't remind me again/i }));
    await user.click(screen.getByRole("button", { name: /sign in to save score/i }));

    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.dontRemindSignin)).toBe("true");
  });

  it("persists do-not-remind flag and calls onSkip", async () => {
    const onSignIn = vi.fn();
    const onSkip = vi.fn();
    const user = userEvent.setup();

    render(<SignInPrompt rank={11} onSignIn={onSignIn} onSkip={onSkip} />);

    await user.click(screen.getByRole("checkbox", { name: /don't remind me again/i }));
    await user.click(screen.getByRole("button", { name: /no thanks/i }));

    expect(onSignIn).not.toHaveBeenCalled();
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STORAGE_KEYS.dontRemindSignin)).toBe("true");
  });
});
