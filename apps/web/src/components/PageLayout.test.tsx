import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageLayout } from "./PageLayout";

describe("PageLayout", () => {
  it("renderiza título (heading), ação e conteúdo", () => {
    render(
      <PageLayout title="Clientes" action={<button type="button">+ Nova</button>}>
        <p>conteúdo</p>
      </PageLayout>,
    );
    expect(
      screen.getByRole("heading", { name: "Clientes" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Nova" })).toBeInTheDocument();
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });
});
