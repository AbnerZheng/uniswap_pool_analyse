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
  Position, PositionSnapshot,
  Tick,
  Token,
} from "../common/interfaces/uniswap.interface";
import { averageArray } from "../utils/math";
import BigNumber from "bignumber.js";
import { getPriceForTokenByContract } from "./coingecko";
import { calculatePositionFees } from "../utils/uniswapv3/math";

export const getAvgTradingVolume = async (
  poolAddress: string,
  numberOfDays: number = 7,
): Promise<number> => {
  const { poolDayDatas } = await _queryUniswap(`{
    poolDayDatas(skip: 1, first: ${numberOfDays}, orderBy: date, orderDirection: desc, where:{pool: "${poolAddress}"}) {
      volumeUSD
    }
  }`);

  const volumes = poolDayDatas.map((d: { volumeUSD: string }) =>
    Number(d.volumeUSD),
  );

  return averageArray(volumes);
};

const _getPoolTicksByPage = async (
  poolAddress: string,
  page: number,
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
    `SearchTokenPage_${getCurrentNetwork().id}_tokens`,
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
  token1: Token,
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

const _getPositionSnapshotsForAddress = async (address: string, blockNumber: number = 0): Promise<PositionSnapshot[]> => {
  try {
    const res = await _queryUniswap(`{
        positionSnapshots(
          orderBy: blockNumber
          orderDirection: desc
          where: {
            owner : ${address}
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
const getPositionSnapshots = async (address: string, blockNumber: number = 0) => {
  const positionSnapshots = await _getPositionSnapshotsForAddress(address, blockNumber);
  const positionStatus: Map<string, boolean> = new Map();
  const lpHoldingRecords: LPHoldingRecord[] = [];
  for (let i = positionSnapshots.length - 1; i >= 0; i--) {
    const p = positionSnapshots[i];
    const id = p.position.id;
    const liquidity = new BigNumber(p.liquidity);
    if (!positionStatus.has(id) && liquidity.gt(0) && p.transaction.mints.length) {
      // open lp
      let price0 = new BigNumber(0);
      let price1 = new BigNumber(0);
      if (StableCoinSet.has(p.pool.token0.id)) {
        price0 = new BigNumber(1);
        price1 = new BigNumber(p.transaction.mints[0].amountUSD).minus(p.depositedToken0).div(p.depositedToken1);
      } else if (StableCoinSet.has(p.pool.token1.id)) {
        price1 = new BigNumber(1);
        price0 = new BigNumber(p.transaction.mints[0].amountUSD).minus(p.depositedToken1).div(p.depositedToken0);
      }

      lpHoldingRecords.push({
        id,
        feeTire: p.pool.feeTier, tokenID0: p.pool.token0.id, tokenID1: p.pool.token1.id,
        openToken0Price: price0, openToken1Price: price1,
        opening: true,
        openTimestamp: p.timestamp,
        principalToken0: new BigNumber(p.depositedToken0),
        principalToken1: new BigNumber(p.depositedToken1),
        principalUSD: new BigNumber(p.transaction.mints[0].amountUSD),
        openTransaction: p.transaction.mints[0].transaction.id,
      });
      positionStatus.set(id, true);
    } else if (positionStatus.get(id) && liquidity.eq(0) && p.transaction.burns.length) {
      // close lp
      lpHoldingRecords.filter(r => r.id === id).forEach(r => {
        let price0 = new BigNumber(0);
        let price1 = new BigNumber(0);
        if (StableCoinSet.has(p.pool.token0.id)) {
          price0 = new BigNumber(1);
          price1 = new BigNumber(p.transaction.burns[0].amountUSD).minus(p.withdrawnToken0).div(p.withdrawnToken1);
        } else if (StableCoinSet.has(p.pool.token1.id)) {
          price1 = new BigNumber(1);
          price0 = new BigNumber(p.transaction.burns[0].amountUSD).minus(p.withdrawnToken1).div(p.withdrawnToken0);
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

    for (const r1 of lpHoldingRecords.filter(r => r.opening)) {
      // fill information for lp which are still opening
      const price0 = await getPriceForTokenByContract(r1.tokenID0);
      const price1 = await getPriceForTokenByContract(r1.tokenID1);
      r1.equityToken0Price = new BigNumber(price0);
      r1.equityToken1Price = new BigNumber(price1);
      const positionSnapshot = positionSnapshots.find(pp => pp.position.id === r1.id);
      const fees = calculatePositionFees(positionSnapshot!.pool, positionSnapshot!.position, positionSnapshot!.pool.token0, positionSnapshot!.pool.token1);
      r1.feeToken0 = new BigNumber(fees[0]);
      r1.feeToken1 = new BigNumber(fees[1]);
      r1.feeUSD = r1.feeToken0.multipliedBy(price0).plus(r1.feeToken1.multipliedBy(price1));



    }
  }

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
  volumeUSD_gte: number,
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
        [],
      ),
    );
    const queryPage = Math.ceil(tokenIds.length / 100);
    // batch query getBulkTokens function by page using Promise.all
    const tokens = await Promise.all(
      Array.from({ length: queryPage }, (_, i) => {
        const start = i * 100;
        const end = start + 100;
        return getBulkTokens(tokenIds.slice(start, end));
      }),
    ).then(res => res.flat());
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
