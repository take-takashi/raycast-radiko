import { sample } from "../radiko-guide";

describe("sample", () => {
  it("should return 'hello, world!'", () => {
    expect(sample()).toBe("hello, world!");
  });
});
