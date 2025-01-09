import { selectAllTokens, selectTokenBoostAmounts, selectTokenPresent } from "../db";
import { getRugCheck } from "../transactions";

(async () => {
  const query = false;
  if (query) {
    const res = await selectAllTokens();
    console.log(res);
  }
})();

(async () => {
  const token = null;
  if (token) {
    const res = await selectTokenPresent(token);
    console.log(res);
  }
})();

(async () => {
  const token = null;
  if (token) {
    const res = await selectTokenBoostAmounts(token);
    console.log(res);
  }
})();

(async () => {
  const token = "cGy6G8SakDsCQja1pTnWQ9VvKRc7itoEU2T7QbVPeng";
  if (token) {
    const res = await getRugCheck(token);
    console.log(res);
  }
})();
