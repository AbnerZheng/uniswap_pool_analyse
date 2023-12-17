import axios from "axios";
import { getCurrentNetwork } from "../common/network";
import {
  getTokenLogoURL,
  getUniqueItems,
  sortTokens,
} from "../utils/uniswapv3/helper";
import lscache from "../utils/lscache";
import {
  LPHoldingRecord,
  Pool,
  Position,
  PositionSnapshot,
  Tick,
  Token,
} from "../common/interfaces/uniswap.interface";
import { averageArray } from "../utils/math";
import BigNumber from "bignumber.js";
import { getPriceForTokenByContract } from "./coingecko";
import { calculatePositionFees } from "../utils/uniswapv3/math";

export const getAvgTradingVolume = async (
  poolAddress: string,
  numberOfDays: number = 7
): Promise<number> => {
  const { poolDayDatas } = await _queryUniswap(`{
    poolDayDatas(skip: 1, first: ${numberOfDays}, orderBy: date, orderDirection: desc, where:{pool: "${poolAddress}"}) {
      volumeUSD
    }
  }`);

  const volumes = poolDayDatas.map((d: { volumeUSD: string }) =>
    Number(d.volumeUSD)
  );

  return averageArray(volumes);
};

const _getPoolTicksByPage = async (
  poolAddress: string,
  page: number
): Promise<Tick[]> => {
  const res = await _queryUniswap(`{
    ticks(first: 1000, skip: ${
      page * 1000
    }, where: { poolAddress: "${poolAddress}" }, orderBy: tickIdx) {
      tickIdx
      liquidityNet
      price0
      price1
    }
  }`);

  return res.ticks;
};
export const getPoolTicks = async (poolAddress: string): Promise<Tick[]> => {
  const PAGE_SIZE = 3;
  let result: Tick[] = [];
  let page = 0;
  while (true) {
    const [pool1, pool2, pool3] = await Promise.all([
      _getPoolTicksByPage(poolAddress, page),
      _getPoolTicksByPage(poolAddress, page + 1),
      _getPoolTicksByPage(poolAddress, page + 2),
    ]);

    result = [...result, ...pool1, ...pool2, ...pool3];
    if (pool1.length === 0 || pool2.length === 0 || pool3.length === 0) {
      break;
    }
    page += PAGE_SIZE;
  }
  return result;
};

const _processTokenInfo = (token: Token) => {
  token.logoURI = getTokenLogoURL(getCurrentNetwork().id, token.id);

  // TODO: check the network id before replace the token name
  if (token.name === "Wrapped Ether" || token.name === "Wrapped Ethereum") {
    token.name = "Ethereum";
    token.symbol = "ETH";
    token.logoURI =
      "https://cdn.iconscout.com/icon/free/png-128/ethereum-2752194-2285011.png";
  }
  if (token.name === "Wrapped Matic") {
    token.name = "Polygon Native Token";
    token.symbol = "MATIC";
  }
  if (token.name === "Wrapped BNB") {
    token.name = "BSC Native Token";
    token.symbol = "BNB";
  }

  return token;
};
export const getTopTokenList = async (): Promise<Token[]> => {
  const cacheKey = `${getCurrentNetwork().id}_getTopTokenList`;
  const cacheData = lscache.get(cacheKey);
  const searchTokenPageItems = localStorage.getItem(
    `SearchTokenPage_${getCurrentNetwork().id}_tokens`
  );
  if (cacheData) {
    if (searchTokenPageItems !== null) {
      return [...cacheData, ...JSON.parse(searchTokenPageItems)];
    }
    return cacheData;
  }

  const res = await _queryUniswap(`{
    tokens(skip: 0, first: 500, orderBy: volumeUSD, orderDirection: desc) {
      id
      name
      symbol
      volumeUSD
      decimals
    }
  }`);

  if (res === undefined || res.tokens.length === 0) {
    return [];
  }

  const tokens = res.tokens as Token[];
  let result = tokens
    .map(_processTokenInfo)
    .filter((token) => token.symbol.length < 30);

  lscache.set(cacheKey, result, 10); // 10 mins
  if (searchTokenPageItems !== null) {
    result = [...result, ...JSON.parse(searchTokenPageItems)];
  }

  return result;
};

export const getToken = async (tokenAddress: string): Promise<Token> => {
  const res = await _queryUniswap(`{
    token(id: "${tokenAddress.toLowerCase()}") {
      id
      name
      symbol
      volumeUSD
      decimals
    }
  }`);

  if (res.token !== null) {
    res.token = _processTokenInfo(res.token);
  }

  return res.token;
};

export const getPoolFromPair = async (
  token0: Token,
  token1: Token
): Promise<Pool[]> => {
  const sortedTokens = sortTokens(token0, token1);

  let feeGrowthGlobal = `feeGrowthGlobal0X128\nfeeGrowthGlobal1X128`;
  if (getCurrentNetwork().disabledTopPositions) {
    feeGrowthGlobal = "";
  }

  const { pools } = await _queryUniswap(`{
    pools(orderBy: feeTier, where: {
        token0: "${sortedTokens[0].id}",
        token1: "${sortedTokens[1].id}"}) {
      id
      tick
      sqrtPrice
      feeTier
      liquidity
      token0Price
      token1Price
      ${feeGrowthGlobal}
    }
  }`);

  return pools as Pool[];
};

export const getCurrentTick = async (poolId: string): Promise<string> => {
  const { pool } = await _queryUniswap(`{
    pool(id: "${poolId}") {
      tick
    }
  }`);
  return pool.tick;
};

// private helper functions
const _queryUniswap = async (query: string): Promise<any> => {
  const { data } = await axios({
    url: getCurrentNetwork().subgraphEndpoint,
    method: "post",
    data: {
      query,
    },
  });

  const errors = data.errors;
  if (errors && errors.length > 0) {
    console.error("Uniswap Subgraph Errors", { errors, query });
    throw new Error(`Uniswap Subgraph Errors: ${JSON.stringify(errors)}`);
  }

  return data.data;
};

const StableCoinSet = new Set([
  "0x7F5c764cBc14f9669B88837ca1490cCa17c31607".toLowerCase(),
]);

const _getPositionSnapshotsForAddress = async (
  address: string,
  blockNumber: number = 0
): Promise<PositionSnapshot[]> => {
  return [
    {
      position: {
        id: "467388",
        liquidity: "199486544038781090",
        tickLower: {
          tickIdx: "-269520",
          feeGrowthOutside0X128: "97659080377574330727063353409307104894375717",
        },
        tickUpper: {
          tickIdx: "-267900",
          feeGrowthOutside0X128: "6887400986990535049638647301859525104147057",
        },
        feeGrowthInside0LastX128: "5643232589123202072279476202331375214447141",
        feeGrowthInside1LastX128: "12368049913285458580200978499547",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "199486544038781090",
      blockNumber: "113470210",
      timestamp: "1702539197",
      depositedToken0: "233.775485702568143869",
      depositedToken1: "23107.779902",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x927b9d8fd273bc31ff3536d2c4493e049770320448e27728d6956a5cbfc3b50f",
            },
            amountUSD: "23605.96672407475720756380994769956",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "467387",
        liquidity: "626275517193904256",
        tickLower: {
          tickIdx: "-268440",
          feeGrowthOutside0X128: "9354102241694890923577159749819144773639176",
        },
        tickUpper: {
          tickIdx: "-267300",
          feeGrowthOutside0X128: "4923543797226838347637301965437811442105092",
        },
        feeGrowthInside0LastX128: "4338909725714742598270584242967803989973862",
        feeGrowthInside1LastX128: "10090534199099423670173383523032",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "626275517193904256",
      blockNumber: "113470103",
      timestamp: "1702538983",
      depositedToken0: "14852.733261040205855375",
      depositedToken1: "19177.566414",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x092f131875d98af0fb53392f7f1aa8b07febbf61316c0e30846108851231f568",
            },
            amountUSD: "53167.68134375245140596899892058682",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "467363",
        liquidity: "0",
        tickLower: {
          tickIdx: "265320",
          feeGrowthOutside0X128: "4356313144828416318711169453061",
        },
        tickUpper: {
          tickIdx: "268140",
          feeGrowthOutside0X128: "4528192237599538307462233820173",
        },
        feeGrowthInside0LastX128: "111142015412996182645142280146",
        feeGrowthInside1LastX128: "35437031951076198355058764067099500059731",
      },
      pool: {
        token0: {
          id: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
          decimals: "6",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "4792279302228460419608214388676",
        feeGrowthGlobal1X128: "2322209834277144679521593799710839229811432",
        feeTier: "3000",
      },
      liquidity: "0",
      blockNumber: "113470021",
      timestamp: "1702538819",
      depositedToken0: "0",
      depositedToken1: "9531.078002538012267043",
      withdrawnToken0: "763.929691",
      withdrawnToken1: "9195.627328262185651771",
      collectedFeesToken0: "3.224818",
      collectedFeesToken1: "0.404940912573807776",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0xf94ed8351cf02b7f7e961f6908d7eb22c9d048722717127f9f7071054429374d",
            },
            amountUSD: "21796.4405389290503016600257071443",
          },
        ],
      },
    },
    {
      position: {
        id: "467360",
        liquidity: "0",
        tickLower: {
          tickIdx: "-269040",
          feeGrowthOutside0X128: "11777782530770009896111539022127714487950624",
        },
        tickUpper: {
          tickIdx: "-267720",
          feeGrowthOutside0X128: "6292782652669986343141821338883428632074344",
        },
        feeGrowthInside0LastX128: "5268437890732212587632038813594590070226490",
        feeGrowthInside1LastX128: "11758501373664996579834465366520",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "0",
      blockNumber: "113470009",
      timestamp: "1702538795",
      depositedToken0: "8526.54528705324914953",
      depositedToken1: "36264.835936",
      withdrawnToken0: "5891.697634544047976615",
      withdrawnToken1: "42258.338596",
      collectedFeesToken0: "3.941659153834193225",
      collectedFeesToken1: "27.00772",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0xe5c4e32049ef9a6709b3ecad8d9c6cf9739adb9f07baf121a63782b092e2b976",
            },
            amountUSD: "55722.67268333064343105548539220185",
          },
        ],
      },
    },
    {
      position: {
        id: "467363",
        liquidity: "0",
        tickLower: {
          tickIdx: "265320",
          feeGrowthOutside0X128: "4356313144828416318711169453061",
        },
        tickUpper: {
          tickIdx: "268140",
          feeGrowthOutside0X128: "4528192237599538307462233820173",
        },
        feeGrowthInside0LastX128: "111142015412996182645142280146",
        feeGrowthInside1LastX128: "35437031951076198355058764067099500059731",
      },
      pool: {
        token0: {
          id: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
          decimals: "6",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "4792279302228460419608214388676",
        feeGrowthGlobal1X128: "2322209834277144679521593799710839229811432",
        feeTier: "3000",
      },
      liquidity: "109120458735762569",
      blockNumber: "113468355",
      timestamp: "1702535487",
      depositedToken0: "0",
      depositedToken1: "9531.078002538012267043",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x81014ed9ec726e5548ff1e10ed1766dea96b909d0277fa9069940754e795678c",
            },
            amountUSD: "21491.31279965410181571595001399526",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "467361",
        liquidity: "0",
        tickLower: {
          tickIdx: "267180",
          feeGrowthOutside0X128: "1017255188800192948153790421349",
        },
        tickUpper: {
          tickIdx: "268140",
          feeGrowthOutside0X128: "4528192237599538307462233820173",
        },
        feeGrowthInside0LastX128: "3440143665199497089141391079172",
        feeGrowthInside1LastX128: "1696706126469403660587927266465106580755598",
      },
      pool: {
        token0: {
          id: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
          decimals: "6",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "4792279302228460419608214388676",
        feeGrowthGlobal1X128: "2322209834277144679521593799710839229811432",
        feeTier: "3000",
      },
      liquidity: "0",
      blockNumber: "113468318",
      timestamp: "1702535413",
      depositedToken0: "0",
      depositedToken1: "9531.078002538012299803",
      withdrawnToken0: "0",
      withdrawnToken1: "9531.078002538012299802",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0xc01c438ca58b4f4619adc24787fdf16966bb17a36ce84274ce3c6b2348269daa",
            },
            amountUSD: "21491.31279965410188958313647668006",
          },
        ],
      },
    },
    {
      position: {
        id: "467361",
        liquidity: "0",
        tickLower: {
          tickIdx: "267180",
          feeGrowthOutside0X128: "1017255188800192948153790421349",
        },
        tickUpper: {
          tickIdx: "268140",
          feeGrowthOutside0X128: "4528192237599538307462233820173",
        },
        feeGrowthInside0LastX128: "3440143665199497089141391079172",
        feeGrowthInside1LastX128: "1696706126469403660587927266465106580755598",
      },
      pool: {
        token0: {
          id: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
          decimals: "6",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "4792279302228460419608214388676",
        feeGrowthGlobal1X128: "2322209834277144679521593799710839229811432",
        feeTier: "3000",
      },
      liquidity: "306202230851639373",
      blockNumber: "113468297",
      timestamp: "1702535371",
      depositedToken0: "0",
      depositedToken1: "9531.078002538012299803",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0xdd285bd753e244374a8375a5daa505dbae5644c6de600c2a75954dd397558db1",
            },
            amountUSD: "21470.92164478678867283996508493581",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "467360",
        liquidity: "0",
        tickLower: {
          tickIdx: "-269040",
          feeGrowthOutside0X128: "11777782530770009896111539022127714487950624",
        },
        tickUpper: {
          tickIdx: "-267720",
          feeGrowthOutside0X128: "6292782652669986343141821338883428632074344",
        },
        feeGrowthInside0LastX128: "5268437890732212587632038813594590070226490",
        feeGrowthInside1LastX128: "11758501373664996579834465366520",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "569965692747744913",
      blockNumber: "113468206",
      timestamp: "1702535189",
      depositedToken0: "8526.54528705324914953",
      depositedToken1: "36264.835936",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0xe83c450502fffdef83e18bbcbf4fdf8f2991d3f721eed1e395386b5fe2960200",
            },
            amountUSD: "55386.95839148690797591542858812937",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "466558",
        liquidity: "0",
        tickLower: {
          tickIdx: "-269580",
          feeGrowthOutside0X128: "97512415140610397767868585936853329547896436",
        },
        tickUpper: {
          tickIdx: "-267420",
          feeGrowthOutside0X128: "5253312205877815581268516331128076551110738",
        },
        feeGrowthInside0LastX128: "7421614993588972841794940035814890969410303",
        feeGrowthInside1LastX128: "16522968113947081003321441572622",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "0",
      blockNumber: "113468160",
      timestamp: "1702535097",
      depositedToken0: "7000.022424151785487403",
      depositedToken1: "40275.700401",
      withdrawnToken0: "8943.749668588592515621",
      withdrawnToken1: "35855.257473",
      collectedFeesToken0: "188.979007407992103071",
      collectedFeesToken1: "409.578463",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x8037d39222e105aa2b828d7f24260ca70444035d707ce788dcdc3f2aa119507a",
            },
            amountUSD: "55892.7753025959331438676988290801",
          },
        ],
      },
    },
    {
      position: {
        id: "466558",
        liquidity: "0",
        tickLower: {
          tickIdx: "-269580",
          feeGrowthOutside0X128: "97512415140610397767868585936853329547896436",
        },
        tickUpper: {
          tickIdx: "-267420",
          feeGrowthOutside0X128: "5253312205877815581268516331128076551110738",
        },
        feeGrowthInside0LastX128: "7421614993588972841794940035814890969410303",
        feeGrowthInside1LastX128: "16522968113947081003321441572622",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "355627396701729442",
      blockNumber: "113394717",
      timestamp: "1702388211",
      depositedToken0: "7000.022424151785487403",
      depositedToken1: "40275.700401",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0xfa8b796a7b4a15c0949c4d35d4f01c6bcf3a5edda72833687c1b689e3dedc8ff",
            },
            amountUSD: "3330.442672371245089810712977179094",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "466558",
        liquidity: "0",
        tickLower: {
          tickIdx: "-269580",
          feeGrowthOutside0X128: "97512415140610397767868585936853329547896436",
        },
        tickUpper: {
          tickIdx: "-267420",
          feeGrowthOutside0X128: "5253312205877815581268516331128076551110738",
        },
        feeGrowthInside0LastX128: "7421614993588972841794940035814890969410303",
        feeGrowthInside1LastX128: "16522968113947081003321441572622",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "334631650493231077",
      blockNumber: "113394656",
      timestamp: "1702388089",
      depositedToken0: "6616.314095551815802453",
      depositedToken1: "37829.956291",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0xaec78e26f7ec493d794b89c3d07fb8dafe336d920c356e2d3a7311710d799ced",
            },
            amountUSD: "53174.26422676257107687466911381927",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "466415",
        liquidity: "0",
        tickLower: {
          tickIdx: "-269400",
          feeGrowthOutside0X128: "97015236938208912294822854705650988263588598",
        },
        tickUpper: {
          tickIdx: "-267240",
          feeGrowthOutside0X128: "4789376626727260196233929388308039891724365",
        },
        feeGrowthInside0LastX128: "8199285904243227631523814348284145425250957",
        feeGrowthInside1LastX128: "18420941968735313497860763092822",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "0",
      blockNumber: "113394519",
      timestamp: "1702387815",
      depositedToken0: "3480.539271408452258182",
      depositedToken1: "57669.372054",
      withdrawnToken0: "10930.361468112646039809",
      withdrawnToken1: "40169.194705",
      collectedFeesToken0: "67.803365776941907319",
      collectedFeesToken1: "106.505696",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x38a03b1040307c1906a361faa2311a1bc73c5e1b30e29f9ccebdbdf1dbe0cc9f",
            },
            amountUSD: "65223.81053020046198417978506162867",
          },
        ],
      },
    },
    {
      position: {
        id: "466415",
        liquidity: "0",
        tickLower: {
          tickIdx: "-269400",
          feeGrowthOutside0X128: "97015236938208912294822854705650988263588598",
        },
        tickUpper: {
          tickIdx: "-267240",
          feeGrowthOutside0X128: "4789376626727260196233929388308039891724365",
        },
        feeGrowthInside0LastX128: "8199285904243227631523814348284145425250957",
        feeGrowthInside1LastX128: "18420941968735313497860763092822",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "410554788955704801",
      blockNumber: "113380079",
      timestamp: "1702358935",
      depositedToken0: "3480.539271408452258182",
      depositedToken1: "57669.372054",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x0750941fef99926f5971d90bce847f2f0dc153ee36b5662d818606deea63f698",
            },
            amountUSD: "65944.26084329091216862304864219072",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "465436",
        liquidity: "0",
        tickLower: {
          tickIdx: "-269640",
          feeGrowthOutside0X128: "97382902761033628961683050485430855070866248",
        },
        tickUpper: {
          tickIdx: "-267600",
          feeGrowthOutside0X128: "5857423954474616291803616136318794019619390",
        },
        feeGrowthInside0LastX128: "6713854383695031243332480282100922746161706",
        feeGrowthInside1LastX128: "14841710862025530435222405874232",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "0",
      blockNumber: "113380039",
      timestamp: "1702358855",
      depositedToken0: "18427.617195894797458545",
      depositedToken1: "15941.987226",
      withdrawnToken0: "0",
      withdrawnToken1: "56952.508275",
      collectedFeesToken0: "262.476607950033507302",
      collectedFeesToken1: "716.863779",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0xd394d2538daa87e55fcce6e8ca239000bc3cbe8760e909271b3162cfc75baa1f",
            },
            amountUSD: "56857.17093122342830972157210532957",
          },
        ],
      },
    },
    {
      position: {
        id: "465436",
        liquidity: "0",
        tickLower: {
          tickIdx: "-269640",
          feeGrowthOutside0X128: "97382902761033628961683050485430855070866248",
        },
        tickUpper: {
          tickIdx: "-267600",
          feeGrowthOutside0X128: "5857423954474616291803616136318794019619390",
        },
        feeGrowthInside0LastX128: "6713854383695031243332480282100922746161706",
        feeGrowthInside1LastX128: "14841710862025530435222405874232",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "379720218229698934",
      blockNumber: "113335650",
      timestamp: "1702270077",
      depositedToken0: "18427.617195894797458545",
      depositedToken1: "15941.987226",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0xd0b8b5054a40a0d7f2d9ea4ff3994e8d4c97c51320c4d9f7668edb00284c37ac",
            },
            amountUSD: "54268.69623794612951594923120103756",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "464638",
        liquidity: "0",
        tickLower: {
          tickIdx: "-270180",
          feeGrowthOutside0X128: "96067107895846017410811966033734894546627888",
        },
        tickUpper: {
          tickIdx: "-268260",
          feeGrowthOutside0X128: "8507452238138188987586590483269775211274735",
        },
        feeGrowthInside0LastX128: "5494230461402689122367267531175307308321941",
        feeGrowthInside1LastX128: "11420438347271336456162485673248",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "0",
      blockNumber: "113335516",
      timestamp: "1702269809",
      depositedToken0: "6812.098656090440989678",
      depositedToken1: "40663.55034",
      withdrawnToken0: "10718.290547907059223326",
      withdrawnToken1: "32453.995303",
      collectedFeesToken0: "232.349369217116709041",
      collectedFeesToken1: "465.085294",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x30653370cd0f2be9a7f4e800672864a6409edab48c32da13b16eb4f40f8a9e0d",
            },
            amountUSD: "54758.36878236088941007465435238154",
          },
        ],
      },
    },
    {
      position: {
        id: "464638",
        liquidity: "0",
        tickLower: {
          tickIdx: "-270180",
          feeGrowthOutside0X128: "96067107895846017410811966033734894546627888",
        },
        tickUpper: {
          tickIdx: "-268260",
          feeGrowthOutside0X128: "8507452238138188987586590483269775211274735",
        },
        feeGrowthInside0LastX128: "5494230461402689122367267531175307308321941",
        feeGrowthInside1LastX128: "11420438347271336456162485673248",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "405497327429674481",
      blockNumber: "113260068",
      timestamp: "1702118913",
      depositedToken0: "6812.098656090440989678",
      depositedToken1: "40663.55034",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x69c220b1bbf7e897ea4e5df1f8dea672be295b24e59969a8a05df0ef0a723dc4",
            },
            amountUSD: "55085.33297356445817469227776372264",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "464187",
        liquidity: "0",
        tickLower: {
          tickIdx: "-271320",
          feeGrowthOutside0X128: "85234273132305345218740421247929589105298122",
        },
        tickUpper: {
          tickIdx: "-268260",
          feeGrowthOutside0X128: "8507452238138188987586590483269775211274735",
        },
        feeGrowthInside0LastX128:
          "16132083931697970755934577573736752447238618",
        feeGrowthInside1LastX128: "30998197200682182858775439750741",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "0",
      blockNumber: "113259968",
      timestamp: "1702118713",
      depositedToken0: "3892.489284964457862876",
      depositedToken1: "40440.814081",
      withdrawnToken0: "3872.780005466180117412",
      withdrawnToken1: "40482.813914",
      collectedFeesToken0: "84.380663893367593771",
      collectedFeesToken1: "180.736426",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x8521affe0e7fb77f197c7a89708755bb4c45e82bd47bdb99691b2e5e42d83e84",
            },
            amountUSD: "48643.28317596113091009246605972396",
          },
        ],
      },
    },
    {
      position: {
        id: "464187",
        liquidity: "0",
        tickLower: {
          tickIdx: "-271320",
          feeGrowthOutside0X128: "85234273132305345218740421247929589105298122",
        },
        tickUpper: {
          tickIdx: "-268260",
          feeGrowthOutside0X128: "8507452238138188987586590483269775211274735",
        },
        feeGrowthInside0LastX128:
          "16132083931697970755934577573736752447238618",
        feeGrowthInside1LastX128: "30998197200682182858775439750741",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        token1: {
          id: "0x7f5c764cbc14f9669b88837ca1490cca17c31607",
          decimals: "6",
        },
        feeGrowthGlobal0X128: "110406942604219311187937492467171708429917490",
        feeGrowthGlobal1X128: "140500404169410933591656145031393",
        feeTier: "3000",
      },
      liquidity: "230531297507792096",
      blockNumber: "113217692",
      timestamp: "1702034161",
      depositedToken0: "3892.489284964457862876",
      depositedToken1: "40440.814081",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0xae03c909437604a2d3b290b268d8548a7259502a2b0492690b720b532ae5c994",
            },
            amountUSD: "48658.88555180679338429042372676766",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "464058",
        liquidity: "0",
        tickLower: {
          tickIdx: "268380",
          feeGrowthOutside0X128: "4497278845743813637745172625649",
        },
        tickUpper: {
          tickIdx: "271320",
          feeGrowthOutside0X128: "0",
        },
        feeGrowthInside0LastX128: "35644743059363458746418649525",
        feeGrowthInside1LastX128: "21871844081104074139079718887694252375423",
      },
      pool: {
        token0: {
          id: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
          decimals: "6",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "4792279302228460419608214388676",
        feeGrowthGlobal1X128: "2322209834277144679521593799710839229811432",
        feeTier: "3000",
      },
      liquidity: "0",
      blockNumber: "113217508",
      timestamp: "1702033793",
      depositedToken0: "43070.626772",
      depositedToken1: "2109.55386850242190534",
      withdrawnToken0: "40431.597815",
      withdrawnToken1: "3343.649930214756605446",
      collectedFeesToken0: "24.55885",
      collectedFeesToken1: "15.069468876318261956",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x90a8ae6b9a228b360101c2d2b9232d6b6282e907eda011307b01bf12f8ecbcf6",
            },
            amountUSD: "47512.19442586540908724705265482242",
          },
        ],
      },
    },
    {
      position: {
        id: "464058",
        liquidity: "0",
        tickLower: {
          tickIdx: "268380",
          feeGrowthOutside0X128: "4497278845743813637745172625649",
        },
        tickUpper: {
          tickIdx: "271320",
          feeGrowthOutside0X128: "0",
        },
        feeGrowthInside0LastX128: "35644743059363458746418649525",
        feeGrowthInside1LastX128: "21871844081104074139079718887694252375423",
      },
      pool: {
        token0: {
          id: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
          decimals: "6",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "4792279302228460419608214388676",
        feeGrowthGlobal1X128: "2322209834277144679521593799710839229811432",
        feeTier: "3000",
      },
      liquidity: "234450946086670431",
      blockNumber: "113217499",
      timestamp: "1702033775",
      depositedToken0: "43070.626772",
      depositedToken1: "2109.55386850242190534",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "24.55885",
      collectedFeesToken1: "15.069468876318261956",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x7cda31f90d4750c1ad2a07d65a91ecbf3ad45aa9db7cd6721e1d942f0cf331cb",
            },
            amountUSD: "0",
          },
        ],
      },
    },
    {
      position: {
        id: "464058",
        liquidity: "0",
        tickLower: {
          tickIdx: "268380",
          feeGrowthOutside0X128: "4497278845743813637745172625649",
        },
        tickUpper: {
          tickIdx: "271320",
          feeGrowthOutside0X128: "0",
        },
        feeGrowthInside0LastX128: "35644743059363458746418649525",
        feeGrowthInside1LastX128: "21871844081104074139079718887694252375423",
      },
      pool: {
        token0: {
          id: "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
          decimals: "6",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "4792279302228460419608214388676",
        feeGrowthGlobal1X128: "2322209834277144679521593799710839229811432",
        feeTier: "3000",
      },
      liquidity: "234450946086670431",
      blockNumber: "113205964",
      timestamp: "1702010705",
      depositedToken0: "43070.626772",
      depositedToken1: "2109.55386850242190534",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x2893bc59c376d57059a932a0a2010102fbc017a371f750858353a71845677b7a",
            },
            amountUSD: "47706.40272369263241444446210760979",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "143356",
        liquidity: "0",
        tickLower: {
          tickIdx: "67200",
          feeGrowthOutside0X128:
            "408629739974703417445891071153119285938168722660724",
        },
        tickUpper: {
          tickIdx: "67680",
          feeGrowthOutside0X128:
            "408629739974703466588226493864731292358538363987586",
        },
        feeGrowthInside0LastX128: "23344741361185172839499345358952778",
        feeGrowthInside1LastX128: "20818425316793860752616741646612416950",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128:
          "408629739974704797549300495653251864655271047528862",
        feeGrowthGlobal1X128: "3745810559772651628650163408887550102983",
        feeTier: "3000",
      },
      liquidity: "0",
      blockNumber: "19177899",
      timestamp: "1660564287",
      depositedToken0: "0.047008395586955577",
      depositedToken1: "14016.993530709106789159",
      withdrawnToken0: "0",
      withdrawnToken1: "14057.854022774329003708",
      collectedFeesToken0: "0.001275902148128792",
      collectedFeesToken1: "1.231623709580365411",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x7afecf4231d4360792afc4cfda906ac8e1f3a24bcf96dec1cce6e7a7c772d314",
            },
            amountUSD: "20037.33782098582059955917880238681",
          },
        ],
      },
    },
    {
      position: {
        id: "143356",
        liquidity: "0",
        tickLower: {
          tickIdx: "67200",
          feeGrowthOutside0X128:
            "408629739974703417445891071153119285938168722660724",
        },
        tickUpper: {
          tickIdx: "67680",
          feeGrowthOutside0X128:
            "408629739974703466588226493864731292358538363987586",
        },
        feeGrowthInside0LastX128: "23344741361185172839499345358952778",
        feeGrowthInside1LastX128: "20818425316793860752616741646612416950",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128:
          "408629739974704797549300495653251864655271047528862",
        feeGrowthGlobal1X128: "3745810559772651628650163408887550102983",
        feeTier: "3000",
      },
      liquidity: "20107186381845810850347",
      blockNumber: "18278100",
      timestamp: "1659948889",
      depositedToken0: "0.047008395586955577",
      depositedToken1: "14016.993530709106789159",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0xe1bf7a82bdc755aa14bc27525d07e610c0111a345ce698254b7d39d5299afd8d",
            },
            amountUSD: "28631.14575359151634557841854620975",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "142571",
        liquidity: "0",
        tickLower: {
          tickIdx: "66000",
          feeGrowthOutside0X128:
            "408629739974703407574661515380322380966828048299313",
        },
        tickUpper: {
          tickIdx: "67620",
          feeGrowthOutside0X128:
            "408629739974703566262016312389300910236159892872235",
        },
        feeGrowthInside0LastX128: "65006606381568075320765220247076021",
        feeGrowthInside1LastX128: "68484604956227262272222628577197287112",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128:
          "408629739974704797549300495653251864655271047528862",
        feeGrowthGlobal1X128: "3745810559772651628650163408887550102983",
        feeTier: "3000",
      },
      liquidity: "0",
      blockNumber: "18277768",
      timestamp: "1659948769",
      depositedToken0: "2.488639799917009825",
      depositedToken1: "11852.510267669507889923",
      withdrawnToken0: "0",
      withdrawnToken1: "13977.452009565810373286",
      collectedFeesToken0: "0.038717588723576488",
      collectedFeesToken1: "39.541521143296533379",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x8d42a014ef671783c3acc2fc56a43772f3c98395114928adf5ec05999fb70e6e",
            },
            amountUSD: "28468.46977744521818886203379236639",
          },
        ],
      },
    },
    {
      position: {
        id: "142571",
        liquidity: "0",
        tickLower: {
          tickIdx: "66000",
          feeGrowthOutside0X128:
            "408629739974703407574661515380322380966828048299313",
        },
        tickUpper: {
          tickIdx: "67620",
          feeGrowthOutside0X128:
            "408629739974703566262016312389300910236159892872235",
        },
        feeGrowthInside0LastX128: "65006606381568075320765220247076021",
        feeGrowthInside1LastX128: "68484604956227262272222628577197287112",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128:
          "408629739974704797549300495653251864655271047528862",
        feeGrowthGlobal1X128: "3745810559772651628650163408887550102983",
        feeTier: "3000",
      },
      liquidity: "6111640698378584863565",
      blockNumber: "18078108",
      timestamp: "1659803726",
      depositedToken0: "2.488639799917009825",
      depositedToken1: "11852.510267669507889923",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0xc6bd89e2bb77e72de5c428bd5ee7064fe546022ef7a4748126da0e91fc136bfe",
            },
            amountUSD: "28417.89573664053239023932266218179",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "139307",
        liquidity: "0",
        tickLower: {
          tickIdx: "66360",
          feeGrowthOutside0X128:
            "408629739974703298383037740408488065112564896897994",
        },
        tickUpper: {
          tickIdx: "68280",
          feeGrowthOutside0X128:
            "408629739974703667848329485234641941454625510964293",
        },
        feeGrowthInside0LastX128: "249743276130140378235555080723146476",
        feeGrowthInside1LastX128: "309916205140695282877416811618660889688",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128:
          "408629739974704797549300495653251864655271047528862",
        feeGrowthGlobal1X128: "3745810559772651628650163408887550102983",
        feeTier: "3000",
      },
      liquidity: "0",
      blockNumber: "18077791",
      timestamp: "1659803530",
      depositedToken0: "9.107677620545965329",
      depositedToken1: "5176.127050822185900974",
      withdrawnToken0: "7.190587679150751751",
      withdrawnToken1: "6743.552268676985498331",
      collectedFeesToken0: "0.136819139019464398",
      collectedFeesToken1: "124.419636283304267352",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x90e262f818ff80918acfd05bf7cf6262cb216c1fd7a117f5a8410f961e6b7ca8",
            },
            amountUSD: "26105.80858764487736911268274849771",
          },
        ],
      },
    },
    {
      position: {
        id: "139307",
        liquidity: "0",
        tickLower: {
          tickIdx: "66360",
          feeGrowthOutside0X128:
            "408629739974703298383037740408488065112564896897994",
        },
        tickUpper: {
          tickIdx: "68280",
          feeGrowthOutside0X128:
            "408629739974703667848329485234641941454625510964293",
        },
        feeGrowthInside0LastX128: "249743276130140378235555080723146476",
        feeGrowthInside1LastX128: "309916205140695282877416811618660889688",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128:
          "408629739974704797549300495653251864655271047528862",
        feeGrowthGlobal1X128: "3745810559772651628650163408887550102983",
        feeTier: "3000",
      },
      liquidity: "4705822808033483605445",
      blockNumber: "18050706",
      timestamp: "1659788490",
      depositedToken0: "9.107677620545965329",
      depositedToken1: "5176.127050822185900974",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0.109486748290798729",
      collectedFeesToken1: "108.27552597755204258",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x75acc5d9c6e28e44d705f20b1b2065f01548879dfc184466ec707974abdf3c8b",
            },
            amountUSD: "5389.940653559758807189471747718566",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "139307",
        liquidity: "0",
        tickLower: {
          tickIdx: "66360",
          feeGrowthOutside0X128:
            "408629739974703298383037740408488065112564896897994",
        },
        tickUpper: {
          tickIdx: "68280",
          feeGrowthOutside0X128:
            "408629739974703667848329485234641941454625510964293",
        },
        feeGrowthInside0LastX128: "249743276130140378235555080723146476",
        feeGrowthInside1LastX128: "309916205140695282877416811618660889688",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128:
          "408629739974704797549300495653251864655271047528862",
        feeGrowthGlobal1X128: "3745810559772651628650163408887550102983",
        feeTier: "3000",
      },
      liquidity: "3712252541986093194592",
      blockNumber: "18050659",
      timestamp: "1659788457",
      depositedToken0: "8.166668532847660443",
      depositedToken1: "3257.435246464248235164",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0.109486748290798729",
      collectedFeesToken1: "108.27552597755204258",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x261e14b3b78ef015bb069431d82cb736493d1a44388f0c3787803aa245956e01",
            },
            amountUSD: "0",
          },
        ],
      },
    },
    {
      position: {
        id: "138753",
        liquidity: "0",
        tickLower: {
          tickIdx: "65520",
          feeGrowthOutside0X128:
            "408629739974702823007235012000956142142776858467753",
        },
        tickUpper: {
          tickIdx: "70380",
          feeGrowthOutside0X128: "1055042087802644146496982455315945340",
        },
        feeGrowthInside0LastX128: "578623853248973716254075211374122420",
        feeGrowthInside1LastX128: "753862371855518320276895483260335671933",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128:
          "408629739974704797549300495653251864655271047528862",
        feeGrowthGlobal1X128: "3745810559772651628650163408887550102983",
        feeTier: "3000",
      },
      liquidity: "0",
      blockNumber: "18050610",
      timestamp: "1659788426",
      depositedToken0: "3.354113421919471646",
      depositedToken1: "1148.764581242803799536",
      withdrawnToken0: "2.522013598768846661",
      withdrawnToken1: "1846.597060887849102149",
      collectedFeesToken0: "0.041498195625878007",
      collectedFeesToken1: "37.701914057797732092",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x75d693f267b909a933e168cf54c879c64d0d7ffc66a780f56a7ff8bc6b27f2cb",
            },
            amountUSD: "7957.128808300308044027323332166181",
          },
        ],
      },
    },
    {
      position: {
        id: "139307",
        liquidity: "0",
        tickLower: {
          tickIdx: "66360",
          feeGrowthOutside0X128:
            "408629739974703298383037740408488065112564896897994",
        },
        tickUpper: {
          tickIdx: "68280",
          feeGrowthOutside0X128:
            "408629739974703667848329485234641941454625510964293",
        },
        feeGrowthInside0LastX128: "249743276130140378235555080723146476",
        feeGrowthInside1LastX128: "309916205140695282877416811618660889688",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128:
          "408629739974704797549300495653251864655271047528862",
        feeGrowthGlobal1X128: "3745810559772651628650163408887550102983",
        feeTier: "3000",
      },
      liquidity: "3712252541986093194592",
      blockNumber: "17799571",
      timestamp: "1659675658",
      depositedToken0: "8.166668532847660443",
      depositedToken1: "3257.435246464248235164",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x090792ebbf6312a125bcf4384ca2427dd4c3bff4c3cc17be7c69563c9d74f4da",
            },
            amountUSD: "20217.8722745656948102265297920486",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "138753",
        liquidity: "0",
        tickLower: {
          tickIdx: "65520",
          feeGrowthOutside0X128:
            "408629739974702823007235012000956142142776858467753",
        },
        tickUpper: {
          tickIdx: "70380",
          feeGrowthOutside0X128: "1055042087802644146496982455315945340",
        },
        feeGrowthInside0LastX128: "578623853248973716254075211374122420",
        feeGrowthInside1LastX128: "753862371855518320276895483260335671933",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128:
          "408629739974704797549300495653251864655271047528862",
        feeGrowthGlobal1X128: "3745810559772651628650163408887550102983",
        feeTier: "3000",
      },
      liquidity: "599121183885301022157",
      blockNumber: "17799421",
      timestamp: "1659675518",
      depositedToken0: "3.354113421919471646",
      depositedToken1: "1148.764581242803799536",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0.023681205080963301",
      collectedFeesToken1: "20.106596085661448373",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0xc06295bf6994866ab37932148b3ef1f87853fcfe6cd830d880210cc0ed7a20a4",
            },
            amountUSD: "0",
          },
        ],
      },
    },
    {
      position: {
        id: "138769",
        liquidity: "0",
        tickLower: {
          tickIdx: "70380",
          feeGrowthOutside0X128: "1055042087802644146496982455315945340",
        },
        tickUpper: {
          tickIdx: "74520",
          feeGrowthOutside0X128: "399175978069720511655211889370731004",
        },
        feeGrowthInside0LastX128: "117979979546926647510023982254518266",
        feeGrowthInside1LastX128: "91366872371517625208427285066211028181",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128:
          "408629739974704797549300495653251864655271047528862",
        feeGrowthGlobal1X128: "3745810559772651628650163408887550102983",
        feeTier: "3000",
      },
      liquidity: "0",
      blockNumber: "17799258",
      timestamp: "1659675411",
      depositedToken0: "11",
      depositedToken1: "0",
      withdrawnToken0: "10.999999999999999999",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x7443f40cfd58a8eb110672f27ccae86fae911757dbeb1c11f6a1f3553f8e8623",
            },
            amountUSD: "18259.51501029493634275719920228421",
          },
        ],
      },
    },
    {
      position: {
        id: "138769",
        liquidity: "0",
        tickLower: {
          tickIdx: "70380",
          feeGrowthOutside0X128: "1055042087802644146496982455315945340",
        },
        tickUpper: {
          tickIdx: "74520",
          feeGrowthOutside0X128: "399175978069720511655211889370731004",
        },
        feeGrowthInside0LastX128: "117979979546926647510023982254518266",
        feeGrowthInside1LastX128: "91366872371517625208427285066211028181",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128:
          "408629739974704797549300495653251864655271047528862",
        feeGrowthGlobal1X128: "3745810559772651628650163408887550102983",
        feeTier: "3000",
      },
      liquidity: "1985281673336174951814",
      blockNumber: "17614941",
      timestamp: "1659602355",
      depositedToken0: "11",
      depositedToken1: "0",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x706f5439035964c55e804159b06871c6b874bbe73687cfc4670acb6d98569f90",
            },
            amountUSD: "17875.11136981358364957609957681307",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "97849",
        liquidity: "0",
        tickLower: {
          tickIdx: "68600",
          feeGrowthOutside0X128: "3592083494987478115140390694281986925",
        },
        tickUpper: {
          tickIdx: "71200",
          feeGrowthOutside0X128: "1005267520028661991510204939196134133",
        },
        feeGrowthInside0LastX128: "1152783170298823536153746801726711921",
        feeGrowthInside1LastX128: "1546873979082020760600623202050300670302",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "6039853140463460417921953375360880146",
        feeGrowthGlobal1X128: "5369837226595652660960224044388548668787",
        feeTier: "10000",
      },
      liquidity: "0",
      blockNumber: "17614679",
      timestamp: "1659602233",
      depositedToken0: "0.300797269808166902",
      depositedToken1: "12127.018543760556103614",
      withdrawnToken0: "11.511922749723500109",
      withdrawnToken1: "0",
      collectedFeesToken0: "1.224525385602897801",
      collectedFeesToken1: "1220.245634788579971062",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x153728c5948d579796eaae16f01df43c60100ebac9909397236622797490e858",
            },
            amountUSD: "18709.55314113554826981371634702557",
          },
        ],
      },
    },
    {
      position: {
        id: "138753",
        liquidity: "0",
        tickLower: {
          tickIdx: "65520",
          feeGrowthOutside0X128:
            "408629739974702823007235012000956142142776858467753",
        },
        tickUpper: {
          tickIdx: "70380",
          feeGrowthOutside0X128: "1055042087802644146496982455315945340",
        },
        feeGrowthInside0LastX128: "578623853248973716254075211374122420",
        feeGrowthInside1LastX128: "753862371855518320276895483260335671933",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128:
          "408629739974704797549300495653251864655271047528862",
        feeGrowthGlobal1X128: "3745810559772651628650163408887550102983",
        feeTier: "3000",
      },
      liquidity: "599121183885301022157",
      blockNumber: "17614476",
      timestamp: "1659602143",
      depositedToken0: "3.354113421919471646",
      depositedToken1: "1148.764581242803799536",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x2cc4282e8f702d025089f5e55fc239f1e6af59badea8d051fb1aa70c70e6cc45",
            },
            amountUSD: "7768.808174704461762652101150913323",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "97849",
        liquidity: "0",
        tickLower: {
          tickIdx: "68600",
          feeGrowthOutside0X128: "3592083494987478115140390694281986925",
        },
        tickUpper: {
          tickIdx: "71200",
          feeGrowthOutside0X128: "1005267520028661991510204939196134133",
        },
        feeGrowthInside0LastX128: "1152783170298823536153746801726711921",
        feeGrowthInside1LastX128: "1546873979082020760600623202050300670302",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "6039853140463460417921953375360880146",
        feeGrowthGlobal1X128: "5369837226595652660960224044388548668787",
        feeTier: "10000",
      },
      liquidity: "2915438015516360715169",
      blockNumber: "17614151",
      timestamp: "1659601957",
      depositedToken0: "0.300797269808166902",
      depositedToken1: "12127.018543760556103614",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "1.224525385602897801",
      collectedFeesToken1: "1220.245634788579971062",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x1bd981e617c264bccbdf11683a89f78ac66748a660fb6f1e1ce3d54c23bf4c89",
            },
            amountUSD: "0",
          },
        ],
      },
    },
    {
      position: {
        id: "97849",
        liquidity: "0",
        tickLower: {
          tickIdx: "68600",
          feeGrowthOutside0X128: "3592083494987478115140390694281986925",
        },
        tickUpper: {
          tickIdx: "71200",
          feeGrowthOutside0X128: "1005267520028661991510204939196134133",
        },
        feeGrowthInside0LastX128: "1152783170298823536153746801726711921",
        feeGrowthInside1LastX128: "1546873979082020760600623202050300670302",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "6039853140463460417921953375360880146",
        feeGrowthGlobal1X128: "5369837226595652660960224044388548668787",
        feeTier: "10000",
      },
      liquidity: "2915438015516360715169",
      blockNumber: "9936987",
      timestamp: "1654078151",
      depositedToken0: "0.300797269808166902",
      depositedToken1: "12127.018543760556103614",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0.076000041444984969",
      collectedFeesToken1: "71.481053545776199541",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x4a021fe0494fdfc637b46248f160b283327ecd5f12c41134862162f849c30113",
            },
            amountUSD: "6241.597947717229761136136220898971",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "97849",
        liquidity: "0",
        tickLower: {
          tickIdx: "68600",
          feeGrowthOutside0X128: "3592083494987478115140390694281986925",
        },
        tickUpper: {
          tickIdx: "71200",
          feeGrowthOutside0X128: "1005267520028661991510204939196134133",
        },
        feeGrowthInside0LastX128: "1152783170298823536153746801726711921",
        feeGrowthInside1LastX128: "1546873979082020760600623202050300670302",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "6039853140463460417921953375360880146",
        feeGrowthGlobal1X128: "5369837226595652660960224044388548668787",
        feeTier: "10000",
      },
      liquidity: "1993994645087620286847",
      blockNumber: "9907693",
      timestamp: "1654072882",
      depositedToken0: "0.248434018171034657",
      depositedToken1: "8242.681733358351254993",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0.076000041444984969",
      collectedFeesToken1: "71.481053545776199541",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0xecb2595a808c2072c68624de4540aab42d69a72bc00af4bd8f6fa7b4a8808b4f",
            },
            amountUSD: "9038.126825090773836267213024773122",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "97905",
        liquidity: "0",
        tickLower: {
          tickIdx: "68600",
          feeGrowthOutside0X128: "3592083494987478115140390694281986925",
        },
        tickUpper: {
          tickIdx: "70600",
          feeGrowthOutside0X128: "1137801005940769962912412320281126689",
        },
        feeGrowthInside0LastX128: "1032347207054123480002046434301117616",
        feeGrowthInside1LastX128: "1447182889818007541419670566192385705703",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "6039853140463460417921953375360880146",
        feeGrowthGlobal1X128: "5369837226595652660960224044388548668787",
        feeTier: "10000",
      },
      liquidity: "0",
      blockNumber: "9901364",
      timestamp: "1654071997",
      depositedToken0: "0.206925768029369898",
      depositedToken1: "5639.772166281567957286",
      withdrawnToken0: "0",
      withdrawnToken1: "5868.452917345910902366",
      collectedFeesToken0: "0.154102811501033327",
      collectedFeesToken1: "173.521699891631456456",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x830199cc05a839b9ca24a16cdd3dd8c82da8b728781b440b4cd9200ee0f40003",
            },
            amountUSD: "9253.49782153915839874646629098651",
          },
        ],
      },
    },
    {
      position: {
        id: "97905",
        liquidity: "0",
        tickLower: {
          tickIdx: "68600",
          feeGrowthOutside0X128: "3592083494987478115140390694281986925",
        },
        tickUpper: {
          tickIdx: "70600",
          feeGrowthOutside0X128: "1137801005940769962912412320281126689",
        },
        feeGrowthInside0LastX128: "1032347207054123480002046434301117616",
        feeGrowthInside1LastX128: "1447182889818007541419670566192385705703",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "6039853140463460417921953375360880146",
        feeGrowthGlobal1X128: "5369837226595652660960224044388548668787",
        feeTier: "10000",
      },
      liquidity: "1807570232766567045945",
      blockNumber: "9888327",
      timestamp: "1654070257",
      depositedToken0: "0.206925768029369898",
      depositedToken1: "5639.772166281567957286",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0.143544582065560161",
      collectedFeesToken1: "129.894970120514027824",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x182083d72c6a0df7201c7f425b307e111c88b75207efb7be2eb3c89480d91833",
            },
            amountUSD: "771.4644557898510086403776842729988",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "97905",
        liquidity: "0",
        tickLower: {
          tickIdx: "68600",
          feeGrowthOutside0X128: "3592083494987478115140390694281986925",
        },
        tickUpper: {
          tickIdx: "70600",
          feeGrowthOutside0X128: "1137801005940769962912412320281126689",
        },
        feeGrowthInside0LastX128: "1032347207054123480002046434301117616",
        feeGrowthInside1LastX128: "1447182889818007541419670566192385705703",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "6039853140463460417921953375360880146",
        feeGrowthGlobal1X128: "5369837226595652660960224044388548668787",
        feeTier: "10000",
      },
      liquidity: "1675106390021065300984",
      blockNumber: "9887983",
      timestamp: "1654070212",
      depositedToken0: "0",
      depositedToken1: "5438.396142615277730584",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0.143544582065560161",
      collectedFeesToken1: "129.894970120514027824",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0xc03b18c66b76379ec805d0085a86d74d6d4f77d2ffe588e98b41b130f4d8324b",
            },
            amountUSD: "0",
          },
        ],
      },
    },
    {
      position: {
        id: "97849",
        liquidity: "0",
        tickLower: {
          tickIdx: "68600",
          feeGrowthOutside0X128: "3592083494987478115140390694281986925",
        },
        tickUpper: {
          tickIdx: "71200",
          feeGrowthOutside0X128: "1005267520028661991510204939196134133",
        },
        feeGrowthInside0LastX128: "1152783170298823536153746801726711921",
        feeGrowthInside1LastX128: "1546873979082020760600623202050300670302",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "6039853140463460417921953375360880146",
        feeGrowthGlobal1X128: "5369837226595652660960224044388548668787",
        feeTier: "10000",
      },
      liquidity: "614469663976146131537",
      blockNumber: "9887697",
      timestamp: "1654070167",
      depositedToken0: "0.248434018171034657",
      depositedToken1: "2330.602086241322923331",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0.076000041444984969",
      collectedFeesToken1: "71.481053545776199541",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x70cc57d90426df0b285091a4d5942fb7ef16317292ef4407cd5e403a8bb6ebd5",
            },
            amountUSD: "0",
          },
        ],
      },
    },
    {
      position: {
        id: "97905",
        liquidity: "0",
        tickLower: {
          tickIdx: "68600",
          feeGrowthOutside0X128: "3592083494987478115140390694281986925",
        },
        tickUpper: {
          tickIdx: "70600",
          feeGrowthOutside0X128: "1137801005940769962912412320281126689",
        },
        feeGrowthInside0LastX128: "1032347207054123480002046434301117616",
        feeGrowthInside1LastX128: "1447182889818007541419670566192385705703",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "6039853140463460417921953375360880146",
        feeGrowthGlobal1X128: "5369837226595652660960224044388548668787",
        feeTier: "10000",
      },
      liquidity: "1675106390021065300984",
      blockNumber: "9810685",
      timestamp: "1654060177",
      depositedToken0: "0",
      depositedToken1: "5438.396142615277730584",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x95525c3887ba4712c91b4c461461df98998508cd668e9fc7f448b4055e40a3bf",
            },
            amountUSD: "9056.523698092321729994038779970201",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "97782",
        liquidity: "0",
        tickLower: {
          tickIdx: "-70600",
          feeGrowthOutside0X128: "0",
        },
        tickUpper: {
          tickIdx: "-62600",
          feeGrowthOutside0X128: "0",
        },
        feeGrowthInside0LastX128: "0",
        feeGrowthInside1LastX128: "0",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "6039853140463460417921953375360880146",
        feeGrowthGlobal1X128: "5369837226595652660960224044388548668787",
        feeTier: "10000",
      },
      liquidity: "0",
      blockNumber: "9808398",
      timestamp: "1654059907",
      depositedToken0: "0",
      depositedToken1: "5438.396142615277727838",
      withdrawnToken0: "0",
      withdrawnToken1: "5438.396142615277727837",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0xa1604373d79b48e277c2af584be8d9b44c4d1045abbfa7d2126de7137973a688",
            },
            amountUSD: "8964.087407219947031153619473377108",
          },
        ],
      },
    },
    {
      position: {
        id: "97849",
        liquidity: "0",
        tickLower: {
          tickIdx: "68600",
          feeGrowthOutside0X128: "3592083494987478115140390694281986925",
        },
        tickUpper: {
          tickIdx: "71200",
          feeGrowthOutside0X128: "1005267520028661991510204939196134133",
        },
        feeGrowthInside0LastX128: "1152783170298823536153746801726711921",
        feeGrowthInside1LastX128: "1546873979082020760600623202050300670302",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "6039853140463460417921953375360880146",
        feeGrowthGlobal1X128: "5369837226595652660960224044388548668787",
        feeTier: "10000",
      },
      liquidity: "614469663976146131537",
      blockNumber: "9797759",
      timestamp: "1654058722",
      depositedToken0: "0.248434018171034657",
      depositedToken1: "2330.602086241322923331",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x770544ae08c7e7390c90eaf78490a70e5a3e425b1a5881be3e8917ed5a02243d",
            },
            amountUSD: "4226.622437851833824505154149349871",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "97782",
        liquidity: "0",
        tickLower: {
          tickIdx: "-70600",
          feeGrowthOutside0X128: "0",
        },
        tickUpper: {
          tickIdx: "-62600",
          feeGrowthOutside0X128: "0",
        },
        feeGrowthInside0LastX128: "0",
        feeGrowthInside1LastX128: "0",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "6039853140463460417921953375360880146",
        feeGrowthGlobal1X128: "5369837226595652660960224044388548668787",
        feeTier: "10000",
      },
      liquidity: "377285160759165397460405",
      blockNumber: "9780189",
      timestamp: "1654056712",
      depositedToken0: "0",
      depositedToken1: "5438.396142615277727838",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0xb6be0d5a11dd040d417a490befaadd5a8608f0684909ed339494096faf0e03f2",
            },
            amountUSD: "9228.731058570027133015906631791382",
          },
        ],
        burns: [],
      },
    },
    {
      position: {
        id: "97752",
        liquidity: "0",
        tickLower: {
          tickIdx: "62600",
          feeGrowthOutside0X128: "4175743222642319274421504387215641956",
        },
        tickUpper: {
          tickIdx: "70000",
          feeGrowthOutside0X128: "1453105681736323260857958811178443461",
        },
        feeGrowthInside0LastX128:
          "115792089237316195423570985008687907853269681885695848445274886435864774356995",
        feeGrowthInside1LastX128:
          "115792089237316195423570985008687907852881755794119849212374048634050494682765",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "6039853140463460417921953375360880146",
        feeGrowthGlobal1X128: "5369837226595652660960224044388548668787",
        feeTier: "10000",
      },
      liquidity: "0",
      blockNumber: "9777904",
      timestamp: "1654056457",
      depositedToken0: "0",
      depositedToken1: "4661.204172482645852157",
      withdrawnToken0: "0",
      withdrawnToken1: "4661.204172482645852156",
      collectedFeesToken0: "0.0002967405255679",
      collectedFeesToken1: "0.324608052190900319",
      transaction: {
        mints: [],
        burns: [
          {
            transaction: {
              id: "0x5d3eff5a2aed72d6c0c3befa99ef935c4d2fad6ef06559612db2927b41d87718",
            },
            amountUSD: "8049.967318207943946141180991083887",
          },
        ],
      },
    },
    {
      position: {
        id: "97752",
        liquidity: "0",
        tickLower: {
          tickIdx: "62600",
          feeGrowthOutside0X128: "4175743222642319274421504387215641956",
        },
        tickUpper: {
          tickIdx: "70000",
          feeGrowthOutside0X128: "1453105681736323260857958811178443461",
        },
        feeGrowthInside0LastX128:
          "115792089237316195423570985008687907853269681885695848445274886435864774356995",
        feeGrowthInside1LastX128:
          "115792089237316195423570985008687907852881755794119849212374048634050494682765",
      },
      pool: {
        token0: {
          id: "0x4200000000000000000000000000000000000006",
          decimals: "18",
        },
        token1: {
          id: "0x4200000000000000000000000000000000000042",
          decimals: "18",
        },
        feeGrowthGlobal0X128: "6039853140463460417921953375360880146",
        feeGrowthGlobal1X128: "5369837226595652660960224044388548668787",
        feeTier: "10000",
      },
      liquidity: "455228734519025101210",
      blockNumber: "9773066",
      timestamp: "1654055962",
      depositedToken0: "0",
      depositedToken1: "4661.204172482645852157",
      withdrawnToken0: "0",
      withdrawnToken1: "0",
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      transaction: {
        mints: [
          {
            transaction: {
              id: "0x79131fd326e379f681342846f9af9cd6917ba44125d11c225ce1d302034ac9d8",
            },
            amountUSD: "8239.612783385333691861477780627276",
          },
        ],
        burns: [],
      },
    },
  ] as unknown as PositionSnapshot[];

  try {
    const res = await _queryUniswap(`{
        positionSnapshots(
          orderBy: blockNumber
          orderDirection: desc
          where: {
            owner : "${address}"
            blockNumber_gte: ${blockNumber}
          }
        ){
          position{
            id
            liquidity
            tickLower{
              tickIdx 
              feeGrowthOutside0X128
            }
            tickUpper{
              tickIdx
              feeGrowthOutside0X128
            }
            feeGrowthInside0LastX128
            feeGrowthInside1LastX128
          }
          pool {
            id
            token0{
              id
              decimals
            }
            token1{
              id
              decimals
            }
            feeGrowthGlobal0X128
            feeGrowthGlobal1X128
            feeTier
          }
          liquidity
          blockNumber
          timestamp
          depositedToken0
          depositedToken1
          withdrawnToken0
          withdrawnToken1
          collectedFeesToken0
          collectedFeesToken1
          transaction{
            mints{
              transaction{
                id
              }
              amountUSD
            }
            burns{
              transaction{
                id
              }
              amountUSD
            }
          }
        }}
    `);
    return res.positionSnapshots;
  } catch (e) {
    return [];
  }
};

// TODO(abner) support  increase/decrease liquidity partially if strategy need
export const getPositionSnapshots = async (
  address: string,
  blockNumber: number = 0
): Promise<LPHoldingRecord[]> => {
  const positionSnapshots = await _getPositionSnapshotsForAddress(
    address,
    blockNumber
  );
  const positionStatus: Map<string, boolean> = new Map();
  const lpHoldingRecords: LPHoldingRecord[] = [];
  for (let i = positionSnapshots.length - 1; i >= 0; i--) {
    const p = positionSnapshots[i];
    const id = p.position.id;
    const liquidity = new BigNumber(p.liquidity);
    if (
      !positionStatus.has(id) &&
      liquidity.gt(0) &&
      p.transaction.mints.length
    ) {
      // open lp
      let price0 = new BigNumber(0);
      let price1 = new BigNumber(0);
      if (StableCoinSet.has(p.pool.token0.id)) {
        price0 = new BigNumber(1);
        price1 = new BigNumber(p.transaction.mints[0].amountUSD)
          .minus(p.depositedToken0)
          .div(p.depositedToken1);
      } else if (StableCoinSet.has(p.pool.token1.id)) {
        price1 = new BigNumber(1);
        price0 = new BigNumber(p.transaction.mints[0].amountUSD)
          .minus(p.depositedToken1)
          .div(p.depositedToken0);
      }

      lpHoldingRecords.push({
        id,
        poolId: p.pool.id,
        feeTier: p.pool.feeTier,
        tokenID0: p.pool.token0.id,
        tokenID1: p.pool.token1.id,
        openToken0Price: price0,
        openToken1Price: price1,
        opening: true,
        openTimestamp: p.timestamp,
        principalToken0: new BigNumber(p.depositedToken0),
        principalToken1: new BigNumber(p.depositedToken1),
        principalUSD: new BigNumber(p.transaction.mints[0].amountUSD),
        openTransaction: p.transaction.mints[0].transaction.id,
      });
      positionStatus.set(id, true);
    } else if (
      positionStatus.get(id) &&
      liquidity.eq(0) &&
      p.transaction.burns.length
    ) {
      // close lp
      lpHoldingRecords
        .filter((r) => r.id === id)
        .forEach((r) => {
          let price0 = new BigNumber(0);
          let price1 = new BigNumber(0);
          if (StableCoinSet.has(p.pool.token0.id)) {
            price0 = new BigNumber(1);
            price1 = new BigNumber(p.transaction.burns[0].amountUSD)
              .minus(p.withdrawnToken0)
              .div(p.withdrawnToken1);
          } else if (StableCoinSet.has(p.pool.token1.id)) {
            price1 = new BigNumber(1);
            price0 = new BigNumber(p.transaction.burns[0].amountUSD)
              .minus(p.withdrawnToken1)
              .div(p.withdrawnToken0);
          }
          r.opening = false;
          r.equityToken0Price = price0;
          r.equityToken1Price = price1;
          r.feeToken0 = new BigNumber(p.collectedFeesToken0);
          r.feeToken1 = new BigNumber(p.collectedFeesToken1);
          const feeToken0USD = r.feeToken0.multipliedBy(r.equityToken0Price);
          const feeToken1USD = r.feeToken1.multipliedBy(r.equityToken1Price);
          r.feeUSD = feeToken0USD.plus(feeToken1USD);

          r.equityToken0 = new BigNumber(p.withdrawnToken0).plus(r.feeToken0);
          r.equityToken1 = new BigNumber(p.withdrawnToken1).plus(r.feeToken1);
          r.equityUSD = r.feeUSD.plus(p.transaction.burns[0].amountUSD);
          r.closeTransaction = p.transaction.burns[0].transaction.id;
          r.closeTimestamp = p.timestamp;
        });
      positionStatus.set(id, false);
    }
  }

  for (const r1 of lpHoldingRecords.filter((r) => r.opening)) {
    // fill information for lp which are still opening
    const positionSnapshot = positionSnapshots.find(
      (pp) => pp.position.id === r1.id
    );
    const price0 = positionSnapshot?.pool.token0Price || 0;
    const price1 = positionSnapshot?.pool.token1Price || 0;

    const fees = calculatePositionFees(
      positionSnapshot!.pool,
      positionSnapshot!.position,
      positionSnapshot!.pool.token0,
      positionSnapshot!.pool.token1
    );
    r1.opening = true;
    r1.feeToken0 = new BigNumber(fees[0]);
    r1.feeToken1 = new BigNumber(fees[1]);
    r1.feeUSD = r1.feeToken0
      .multipliedBy(price0)
      .plus(r1.feeToken1.multipliedBy(price1));

    r1.equityToken0 = new BigNumber(
      positionSnapshot?.withdrawnToken0 || 0
    ).plus(r1.feeToken0);
    r1.equityToken1 = new BigNumber(
      positionSnapshot?.withdrawnToken1 || 0
    ).plus(r1.feeToken1);
    r1.equityUSD = r1.equityToken0
      .multipliedBy(price0)
      .plus(r1.equityToken1.multipliedBy(price1));
    r1.equityToken0Price = new BigNumber(price0);
    r1.equityToken1Price = new BigNumber(price1);
  }
  return lpHoldingRecords;
};

const _getPoolPositionsByPage = async (
  poolAddress: string,
  page: number,
  priceToken0: number,
  priceToken1: number
): Promise<Position[]> => {
  try {
    const res = await _queryUniswap(`{
    positions(
      where: {
        and: [
          {pool: "${poolAddress}"},
          {liquidity_gt: 0}
          {or: [{
                  depositedToken0_gt: ${5000 / (priceToken0 || 1)}
                }, {
                  depositedToken1_gt: ${5000 / (priceToken1 || 1)}
                }]
          }
      ]
    }, first: 1000, skip: ${page * 1000}) {
      id
      owner
      tickLower {
        tickIdx
        feeGrowthOutside0X128
        feeGrowthOutside1X128
      }
      tickUpper {
        tickIdx
        feeGrowthOutside0X128
        feeGrowthOutside1X128
      }
      depositedToken0
      depositedToken1
      liquidity
      collectedFeesToken0
      collectedFeesToken1
      feeGrowthInside0LastX128
      feeGrowthInside1LastX128
      transaction {
        timestamp
      }
    }
  }`);
    return res.positions;
  } catch (e) {
    return [];
  }
};

export const getPoolPositions = async (
  poolAddress: string,
  priceToken0: number,
  priceToken1: number
): Promise<Position[]> => {
  const PAGE_SIZE = 3;
  let result: Position[] = [];
  let page = 0;
  while (true) {
    const [p1, p2, p3] = await Promise.all([
      _getPoolPositionsByPage(poolAddress, page, priceToken0, priceToken1),
      _getPoolPositionsByPage(poolAddress, page + 1, priceToken0, priceToken1),
      _getPoolPositionsByPage(poolAddress, page + 2, priceToken0, priceToken1),
    ]);

    result = [...result, ...p1, ...p2, ...p3];
    if (p1.length === 0 || p2.length === 0 || p3.length === 0) {
      break;
    }
    page += PAGE_SIZE;
  }
  return result;
};

const getBulkTokens = async (tokenAddresses: string[]): Promise<Token[]> => {
  const res = await _queryUniswap(`{
    tokens(where: {id_in: [${tokenAddresses
      .map((id) => `"${id}"`)
      .join(",")}]}) {
      id
      name
      symbol
      volumeUSD
      decimals
      totalValueLockedUSD
      tokenDayData(first: 1, orderBy: date, orderDirection: desc) {
        priceUSD
      }
    }
  }`);

  if (res.tokens !== null) {
    res.tokens = res.tokens.map(_processTokenInfo);
  }

  return res.tokens;
};

export const getPools = async (
  totalValueLockedUSD_gte: number,
  volumeUSD_gte: number
): Promise<{
  pools: Pool[];
  tokens: Token[];
}> => {
  try {
    const res = await _queryUniswap(`{
      pools (first: 300, orderBy: totalValueLockedUSD, orderDirection: desc, where: {liquidity_gt: 0, totalValueLockedUSD_gte: ${totalValueLockedUSD_gte}, volumeUSD_gte: ${volumeUSD_gte}}) {
        id
        token0 {
          id
        }
        token1 {
          id
        }
        feeTier
        liquidity
        tick
        totalValueLockedUSD
        poolDayData(first: 15, skip: 1, orderBy: date, orderDirection: desc) {
          date
          volumeUSD
          open 
          high
          low
          close
        }
      }
    }`);

    if (res === undefined || res.pools.length === 0) {
      return { pools: [], tokens: [] };
    }

    const tokenIds = getUniqueItems(
      res.pools.reduce(
        (acc: string[], p: Pool) => [...acc, p.token0.id, p.token1.id],
        []
      )
    );
    const queryPage = Math.ceil(tokenIds.length / 100);
    // batch query getBulkTokens function by page using Promise.all
    const tokens = await Promise.all(
      Array.from({ length: queryPage }, (_, i) => {
        const start = i * 100;
        const end = start + 100;
        return getBulkTokens(tokenIds.slice(start, end));
      })
    ).then((res) => res.flat());
    // sort token by volume
    tokens.sort((a, b) => Number(b.volumeUSD) - Number(a.volumeUSD));
    // map poolCount
    const poolCountByTokenHash = res.pools.reduce((acc: any, p: Pool) => {
      acc[p.token0.id] = (acc[p.token0.id] || 0) + 1;
      acc[p.token1.id] = (acc[p.token1.id] || 0) + 1;
      return acc;
    }, {});
    const _tokens = tokens.map((t: Token) => {
      return {
        ...t,
        poolCount: poolCountByTokenHash[t.id],
      };
    });
    // create hash of tokens id
    const tokenHash = _tokens.reduce((acc: any, t: Token) => {
      acc[t.id] = t;
      return acc;
    }, {});
    // map token0 and token1 to pool
    const pools = res.pools
      .map((p: Pool) => {
        return {
          ...p,
          token0: tokenHash[p.token0.id],
          token1: tokenHash[p.token1.id],
        };
      })
      // fix poolDayData incorrect data
      .map((p: Pool) => {
        const poolDayData = [];
        for (let i = 0; i < p.poolDayData.length - 1; ++i) {
          p.poolDayData[i].open = p.poolDayData[i + 1].close;
          poolDayData.push(p.poolDayData[i]);
        }
        p.poolDayData = poolDayData;
        return p;
      })
      // filter out if poolDayData < 14
      .filter((p: Pool) => p.poolDayData.length === 14);

    return { pools, tokens };
  } catch (e) {
    return { pools: [], tokens: [] };
  }
};
