# raycast-radiko

## setup command

```bash
takashi@Mac raycast-radiko % cd radiko
takashi@Mac radiko % npm install

# テストのため
takashi@Mac radiko % npm install -D jest ts-jest typescript @types/jest
takashi@Mac radiko % npx ts-jest config:init

takashi@Mac radiko % npm install -D ts-node typescript @types/node
```

## dev

```bash
# devコマンドを実行するとraycastからの表示が更新される？
takashi@Mac radiko % npm run dev
```

### 簡易的な実行

```bash
takashi@Mac radiko % npx ts-node src/debug.ts
```
