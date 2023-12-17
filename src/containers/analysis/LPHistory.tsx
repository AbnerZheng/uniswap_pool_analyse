import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { Heading } from "../../common/components/atomic";
import {
  Pool,
  Token,
  PoolDayData,
  LPHoldingRecord,
} from "../../common/interfaces/uniswap.interface";
import { getPools, getPositionSnapshots } from "../../repos/uniswap";
import { ScreenWidth } from "../../utils/styled";
import { formatAmount, formatDollarAmount } from "../../utils/format";
import { getFeeTierPercentage } from "../../utils/uniswapv3/helper";
import {
  estimateFee,
  getLiquidityDelta,
  getPriceFromTick,
  getTokensAmountFromDepositAmountUSD,
} from "../../utils/uniswapv3/math";
import BigNumber from "bignumber.js";
import {
  getCurrentNetwork,
  NETWORKS,
  setCurrentNetwork,
} from "../../common/network";
import { usePoolContext } from "../../context/pool/poolContext";
import { PoolActionType } from "../../context/pool/poolReducer";
import TopPoolTable, {
  PoolColumnDataType,
  Risk,
  RiskChecklist,
} from "../pools/TopPoolTable";
import { LPHistoryTable } from "./LPHistoryTable";

const Container = styled.div`
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 16px;

  @media only screen and (max-width: ${ScreenWidth.MOBILE}px) {
    padding: 12px;
    border-radius: 12px;
  }
`;
const WrappedHeader = styled.div`
  display: flex;
  justify-content: space-between;

  & > div {
    transform: translateY(0);
    display: flex;
    align-items: center;
    color: red;
    font-size: 0.8rem;
    color: #999;
    height: 25px;
    padding: 12px;
    border-radius: 5rem;
    background: rgba(255, 255, 255, 0.05);
  }
`;
const Total = styled.div`
  @media only screen and (max-width: ${ScreenWidth.MOBILE}px) {
    display: none;
  }
`;

export const LPHistory = () => {
  const poolContext = usePoolContext();
  const [isLoading, setIsLoading] = useState(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [pools, setPools] = useState<PoolColumnDataType[]>([]);
  const [lpHistory, setLpHistory] = useState<LPHoldingRecord[]>([]);
  const chainId = poolContext.state.chain?.id || NETWORKS[0].id;

  useEffect(() => {
    let analysisAccountId = poolContext.state.analysisAccountId;
    if (!analysisAccountId) {
      analysisAccountId = "0x803545a8696836df39207f9e3859d11775608a83";
      // return;
    };
    setCurrentNetwork(poolContext.state.chain || NETWORKS[0]);
    setIsLoading(true);

    getPositionSnapshots(analysisAccountId).then((h) => {
      setLpHistory(h);
      setIsLoading(false);
    });
  }, [poolContext.state.analysisAccountId, poolContext.state.chain]);

  return (
    <Container>
      <WrappedHeader>
        <Heading>Account LP History Analysis</Heading>
        <Total>Total: {pools.length} records</Total>
      </WrappedHeader>

      <div
        s tyle={{
          color: "#999",
          marginTop: 10,
          marginBottom: 20,
          fontSize: "1rem",
        }}
      ></div>

      <LPHistoryTable isLoading={isLoading} lpHistoryRecords= {lpHistory}/>
    </Container>
  );
};
