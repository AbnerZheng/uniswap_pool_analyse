const fs                        = require("fs");
const fetch                     = require("node-fetch");
const { DEFAULT_LIST_OF_LISTS } = require("./tokenLists");
const { HttpsProxyAgent }       = require("https-proxy-agent");

const TOKEN_URLS = DEFAULT_LIST_OF_LISTS;

const CHAINID_MAPPING = {
  1    : "ethereum",
  3    : "ethereum",
  4    : "ethereum",
  5    : "ethereum",
  42   : "ethereum",
  80001: "ethereum",
  10   : "optimism",
  420  : "optimism",
  137  : "polygon",
  42161: "arbitrum",
  42220: "celo",
  44787: "celo",
  56   : "bnb",
};
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const agent           = new HttpsProxyAgent("http://127.0.0.1:7890");
Promise.all(TOKEN_URLS.map((url) => fetch(url, { agent }).then(res => res.json())))
  .then((lists) => {
    return lists.map((list) => list.tokens).flat();
  })
  .then((tokens) => {
    return tokens
      .filter((t) => t !== undefined && t.logoURI)
      .reduce((result, curr) => {
        const platform = CHAINID_MAPPING[+curr.chainId];
        if (platform === undefined) return result;
        if (!result[platform]) result[platform] = {};
        
        let logoURI = curr.logoURI;
        if (logoURI.indexOf("ipfs://") !== -1) {
          logoURI = logoURI.replace(`ipfs://`, `https://ipfs.io/ipfs/`);
        }
        result[platform][curr.address.toLowerCase()] = logoURI;
        return result;
      }, {});
  })
  .then((data) => {
    const filepath = "./src/utils/uniswapv3/tokenImageURI.json";
    
    fs.writeFileSync(filepath, JSON.stringify(data, 2, 2));
    console.log(`[DONE] Generated token image URI mapping file to ${filepath}`);
  });
