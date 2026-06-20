import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renderiza a página inicial com a marca Tamarcado", () => {
    render(<App />);
    expect(screen.getByText(/Tamarcado/i)).toBeInTheDocument();
  });
});
