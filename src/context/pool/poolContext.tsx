import React from "react";
import { Network, Token } from "../../common/interfaces/uniswap.interface";
import { PoolColumnDataType } from "../../containers/pools/TopPoolTable";
import { poolContextReducer, PoolContextAction } from "./poolReducer";

export const favoritePoolIdsLocalStorageKey = "poolOverview_favoritePoolIds";
export const followingAccountsLocalStorageKey =
  "accountAnalysis_followingAccounts";

export interface PoolContextState {
  chain: Network | null;
  poolsCache: { [chainId: string]: PoolColumnDataType[] };
  tokensCache: { [chainId: string]: Token[] };
  favoritePoolIds: { [chainId: string]: string[] };
  followingAccounts: { [accountId: string]: string };
  analysisAccountId: string | null;
}
const initialState: PoolContextState = {
  chain: null,
  poolsCache: {},
  tokensCache: {},
  favoritePoolIds: {},
  followingAccounts: {},
  analysisAccountId: null,
};

interface PoolContextProviderProps {
  children: React.ReactNode;
}
const PoolContext = React.createContext<
  | { state: PoolContextState; dispatch: (action: PoolContextAction) => void }
  | undefined
>(undefined);

export const PoolContextProvider = ({ children }: PoolContextProviderProps) => {
  const [state, dispatch] = React.useReducer(poolContextReducer, initialState);
  const value = { state, dispatch };

  return <PoolContext.Provider value={value}>{children}</PoolContext.Provider>;
};

export const usePoolContext = () => {
  const context = React.useContext(PoolContext);
  if (context === undefined) {
    throw new Error("usePoolContext must be used within a PoolContextProvider");
  }
  return context;
};
