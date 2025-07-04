import { ActionPanel, Action, Icon, List } from "@raycast/api";

// STEP1: データを作成
const fruits = [
  { name: "🍎 Apple", url: "https://www.apple.com" },
  { name: "🍌 Banana", url: "https://en.wikipedia.org/wiki/Banana" },
];

// Radikoから番組表を取得


// STEMP2: リストの表示とアクションの定義

export default function Command() {
  return (
    <List searchBarPlaceholder="Search fruits...">
      {fruits.map((fruit) => (
        <List.Item
          key={fruit.name}
          title={fruit.name}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser url={fruit.url} />
              <Action.CopyToClipboard content={fruit.name} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}