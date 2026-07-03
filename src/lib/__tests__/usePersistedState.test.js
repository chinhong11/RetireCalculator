// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { usePersistedState } from "../usePersistedState.js";

beforeEach(() => localStorage.clear());

describe("usePersistedState — float (default)", () => {
  it("uses the fallback when the key is absent", () => {
    const { result } = renderHook(() => usePersistedState("t_num", 42));
    expect(result.current[0]).toBe(42);
  });

  it("reads an existing stored value", () => {
    localStorage.setItem("t_num", "7.5");
    const { result } = renderHook(() => usePersistedState("t_num", 42));
    expect(result.current[0]).toBe(7.5);
  });

  it("persists updates to localStorage", () => {
    const { result } = renderHook(() => usePersistedState("t_num", 42));
    act(() => result.current[1](99));
    expect(localStorage.getItem("t_num")).toBe("99");
  });

  it("a stored 0 stays 0 (does not fall back)", () => {
    localStorage.setItem("t_num", "0");
    const { result } = renderHook(() => usePersistedState("t_num", 5000));
    expect(result.current[0]).toBe(0);
  });

  it("corrupt value falls back", () => {
    localStorage.setItem("t_num", "garbage");
    const { result } = renderHook(() => usePersistedState("t_num", 42));
    expect(result.current[0]).toBe(42);
  });

  it("supports functional updates like useState", () => {
    const { result } = renderHook(() => usePersistedState("t_num", 10));
    act(() => result.current[1](v => v + 5));
    expect(result.current[0]).toBe(15);
    expect(localStorage.getItem("t_num")).toBe("15");
  });
});

describe("usePersistedState — string", () => {
  it("round-trips a string", () => {
    const { result } = renderHook(() => usePersistedState("t_str", "dark", "string"));
    act(() => result.current[1]("light"));
    expect(localStorage.getItem("t_str")).toBe("light");
    const { result: reread } = renderHook(() => usePersistedState("t_str", "dark", "string"));
    expect(reread.current[0]).toBe("light");
  });
});

describe("usePersistedState — bool", () => {
  it("round-trips true/false", () => {
    const { result } = renderHook(() => usePersistedState("t_bool", false, "bool"));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(localStorage.getItem("t_bool")).toBe("true");
    const { result: reread } = renderHook(() => usePersistedState("t_bool", false, "bool"));
    expect(reread.current[0]).toBe(true);
  });

  it("anything other than 'true' parses as false", () => {
    localStorage.setItem("t_bool", "1");
    const { result } = renderHook(() => usePersistedState("t_bool", true, "bool"));
    expect(result.current[0]).toBe(false);
  });
});

describe("usePersistedState — json", () => {
  it("round-trips objects and arrays", () => {
    const { result } = renderHook(() => usePersistedState("t_json", [], "json"));
    act(() => result.current[1]([{ id: 1, name: "prop" }]));
    expect(JSON.parse(localStorage.getItem("t_json"))).toEqual([{ id: 1, name: "prop" }]);
  });

  it("corrupt JSON falls back", () => {
    localStorage.setItem("t_json", "{not json");
    const { result } = renderHook(() => usePersistedState("t_json", ["fb"], "json"));
    expect(result.current[0]).toEqual(["fb"]);
  });
});

describe("usePersistedState — lazy fallback (legacy migration)", () => {
  it("invokes a function fallback when the key is absent", () => {
    localStorage.setItem("legacy_amount", "40000");
    const { result } = renderHook(() =>
      usePersistedState("new_flag", () => parseFloat(localStorage.getItem("legacy_amount")) > 0, "bool"));
    expect(result.current[0]).toBe(true);
  });

  it("prefers the explicit key over the legacy fallback", () => {
    localStorage.setItem("legacy_amount", "40000");
    localStorage.setItem("new_flag", "false");
    const { result } = renderHook(() =>
      usePersistedState("new_flag", () => parseFloat(localStorage.getItem("legacy_amount")) > 0, "bool"));
    expect(result.current[0]).toBe(false);
  });
});
