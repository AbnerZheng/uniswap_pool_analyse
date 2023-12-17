import BigNumber from "bignumber.js";

export interface Network {
  id: string;
  chainId: number;
  name: string;
  desc: string;
  logoURI: string;
  disabled?: boolean;
  isNew?: boolean;
  error?: string;
  subgraphEndpoint: string;

  // for pool overview
  totalValueLockedUSD_gte: number;
  volumeUSD_gte: number;
  disabledTopPositions?: boolean;
}

export interface Tick {
  tickIdx: string;
  liquidityNet: string;
  price0: string;
  price1: string;
}

interface TokenDayData {
  priceUSD: string;
}

export interface Token {
  id: string;
  name: string;
  symbol: string;
  volumeUSD: string;
  logoURI: string;
  decimals: string;

  // For pool overview
  tokenDayData: TokenDayData[];
  totalValueLockedUSD: string;
  poolCount: number;
}

export interface PoolDayData {
  date: number;
  volumeUSD: string;
  open: string;
  high: string;
  low: string;
  close: string;
}

export interface Pool {
  id: string;
  feeTier: string;
  liquidity: string;
  tick: string;
  sqrtPrice: string;
  token0Price: string;
  token1Price: string;
  feeGrowthGlobal0X128: string;
  feeGrowthGlobal1X128: string;

  // For pool overview
  token0: Token;
  token1: Token;
  totalValueLockedUSD: string;
  poolDayData: PoolDayData[];
}

export interface Position {
  id: string;
  owner: string;
  tickLower: {
    tickIdx: string;
    feeGrowthOutside0X128: string;
    feeGrowthOutside1X128: string;
  };
  tickUpper: {
    tickIdx: string;
    feeGrowthOutside0X128: string;
    feeGrowthOutside1X128: string;
  };
  depositedToken0: string;
  depositedToken1: string;
  liquidity: string;
  transaction: {
    timestamp: string;
  };
  collectedFeesToken0: string;
  collectedFeesToken1: string;
  feeGrowthInside0LastX128: string;
  feeGrowthInside1LastX128: string;
}

export interface PositionSnapshot {
  position: Position;
  pool: Pool;
  liquidity: string;
  blockNumber: string;
  timestamp: string;
  depositedToken0: string;
  depositedToken1: string;
  withdrawnToken0: string;
  withdrawnToken1: string;
  collectedFeesToken0: string;
  collectedFeesToken1: string;
  transaction: {
    mints: [{
      transaction: {
        id: string
      }
      amountUSD: string;
    }]
    burns: [{
      transaction: {
        id: string;
      }
      amountUSD: string;
    }];
  };
}

export interface LPHoldingRecord {
  id: string;
  opening: boolean;
  poolId: string;
  tokenID0: string;
  tokenID1: string;
  tokenSymbol0: string;
  tokenSymbol1: string;
  feeTier: string;

  // lp opened
  principalUSD: BigNumber;
  principalToken0: BigNumber;
  principalToken1: BigNumber;

  openToken0Price: BigNumber;
  openToken1Price: BigNumber;
  openTransaction: string;
  openTimestamp: string;

  feeUSD?: BigNumber;
  feeToken0?: BigNumber;
  feeToken1?: BigNumber;
  // lp closed or present value if still opening
  // fees are included
  equityUSD?: BigNumber;
  equityToken0?: BigNumber;
  equityToken1?: BigNumber;
  equityToken0Price?: BigNumber;
  equityToken1Price?: BigNumber;

  closeTransaction?: string;
  closeTimestamp?: string;
}
