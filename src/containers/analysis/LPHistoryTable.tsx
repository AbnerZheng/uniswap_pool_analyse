import React, { useEffect, useState } from "react";
import Chart from "react-apexcharts";
import { StarFilled, StarOutlined } from "@ant-design/icons";
import {
  ConfigProvider,
  theme,
  Table as AntdTable,
  Tooltip,
  Space,
  Button as AntdButton,
  AutoComplete,
  Checkbox,
  SelectProps,
  Popover,
  Badge,
} from "antd";
import { ColumnsType } from "antd/es/table";
import styled from "styled-components";
import { Button } from "../../common/components/atomic";
import {
  Token,
  PoolDayData,
  LPHoldingRecord,
} from "../../common/interfaces/uniswap.interface";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faExchangeAlt,
  faExternalLinkAlt,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { formatDollarAmount } from "../../utils/format";
import { divideArray, round } from "../../utils/math";
import { CheckboxValueType } from "antd/es/checkbox/Group";
import { getCoingeckoToken } from "../../repos/coingecko";
import { usePoolContext } from "../../context/pool/poolContext";
import { PoolActionType } from "../../context/pool/poolReducer";
import { NETWORKS } from "../../common/network";
import { ScreenWidth } from "../../utils/styled";
import { Recoverable } from "repl";

const PairToken = styled.div`
  display: flex;
  align-items: center;
  color: white;
  text-decoration: none;

  & > div {
    margin-right: 7px;

    & img {
      height: 20px;
      border-radius: 50%;
      transform: translateY(2.5px);
    }
    & img:nth-child(2) {
      margin-left: 0px;
    }
  }

  & h3 {
    margin: 0;
    font-size: 0.875rem;
    display: block;

    & svg {
      color: #999;
      font-size: 0.675rem;
      transform: translateX(7px) translateY(-5px);
    }
  }
`;
const FeePercentage = styled.span`
  font-size: 0.875rem;
  padding: 1px 5px;
  border-radius: 5px;
  font-weight: 400;
  color: #999;
  margin-left: 7px;
  background: rgba(255, 255, 255, 0.15);
`;
export const Table = styled.div`
  width: 100%;
  display: grid;
  grid-gap: 5px;
  margin-top: 7px;

  padding: 6px 12px;
  &.adjust-padding-right {
    padding-right: 6px;
  }
  background: rgba(255, 255, 255, 0.075);
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
  color: #aaa;

  & > div {
    display: grid;
    grid-template-columns: 100px 1fr 6rem;
    grid-gap: 7px;

    & > div:nth-child(2) {
      text-align: right;
    }
    & > div:nth-child(3) {
      text-align: left;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 5rem;
      text-align: center;
    }
  }
`;
const TableToken = styled.div`
  display: flex;
  align-items: center;

  & > img {
    height: 18px;
    width: 18px;
    border-radius: 50%;
    transform: translateX(-5px);
  }
`;
const TokenIcon = styled.div`
  color: white;
  display: flex;
  align-items: center;

  & img {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    margin-right: 6px;
  }

  & a {
    color: #777;
    font-size: 0.675rem;
    transform: translateY(-1px);

    & > svg {
      margin-left: 6px;
    }
  }
`;
const CheckList = styled.div`
  margin-top: 7px;

  & > div:nth-child(1) {
    display: flex;
    align-items: center;
    color: #777;
    font-weight: 500;

    & > span:nth-child(1) {
      width: 22px;
    }
  }
  & > div:nth-child(2) {
    margin-left: 22px;
    color: #666;
    font-size: 0.675rem;
  }
`;
const OpeningStatus = styled.div`
  cursor: pointer;
  display: block;
  font-size: 1rem;
  text-align: center;
  color: #999;

  &:hover {
    color: white;
  }
`;

export enum Risk {
  SAFE = "SAFE",
  LOW_RISK = "LOW RISK",
  HIGH_RISK = "HIGH RISK",
}
export interface RiskChecklist {
  lowPoolTVL: boolean;
  lowPoolVolume: boolean;
  highPriceVolatility: boolean;
  lowToken0TVL: boolean;
  lowToken1TVL: boolean;
  lowToken0PoolCount: boolean;
  lowToken1PoolCount: boolean;
}
export interface PoolColumnDataType {
  key: string;
  poolId: string;
  feeTier: string;
  token0: Token;
  token1: Token;
  totalValueLockedUSD: number;
  volume24h: number;
  volume7d: number;
  dailyVolumePerTVL: number;
  fee24h: number;
  priceVolatility24HPercentage: number;
  poolDayDatas: PoolDayData[];
  dailyFeesPerTVL: number;
  risk: Risk;
  riskChecklist: RiskChecklist;
  estimatedFee24h: number;
  estimatedFeeToken0: number;
  estimatedFeeToken1: number;
}

const searchTokenResult = (tokens: Token[], query: string) =>
  tokens
    .filter((token) =>
      `${token.symbol.toLocaleLowerCase()}_${token.id}`.includes(query)
    )
    .map((token) => {
      return {
        value: token.id,
        label: (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <img
                src={token.logoURI}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  marginRight: 8,
                }}
              />
              <b>{token.symbol}</b>
            </div>
            <div style={{ color: "#777" }}>{token.name}</div>
          </div>
        ),
      };
    });

const CandleStickChart = ({ data }: { data: PoolColumnDataType }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isPriceToggle, setIsPriceToggle] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setIsLoading(false);
    }, 200);
  }, []);

  return (
    <div style={{ color: "black" }}>
      <div
        style={{
          color: "white",
          fontWeight: 500,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          {isPriceToggle ? data.token1.symbol : data.token0.symbol}/
          {isPriceToggle ? data.token0.symbol : data.token1.symbol} Price Chart
          (14D)
        </span>
        <div
          style={{
            borderRadius: 7,
            background: "rgba(255, 255, 255, 0.25)",
            cursor: "pointer",
            fontSize: "0.875rem",
            width: 22,
            height: 22,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setIsPriceToggle(!isPriceToggle)}
        >
          <FontAwesomeIcon icon={faExchangeAlt} />
        </div>
      </div>

      {isLoading && <div style={{ height: 205, width: 300 }} />}
      {!isLoading && (
        <Chart
          key={`candlestick-chart-${data.poolId}`}
          options={{
            tooltip: {
              custom: function ({ seriesIndex, dataPointIndex, w }) {
                const data: any =
                  w.globals.initialSeries[seriesIndex].data[dataPointIndex];

                return `<div style="padding: 5px">
                <div style="margin-bottom: 5px">${new Date(
                  data.x
                ).toDateString()}</div> 

                <div><b>Open:</b> ${round(data.y[0], 6)}</div>
                <div><b>High:</b> ${round(data.y[1], 6)}</div>
                <div><b>Low:</b> ${round(data.y[2], 6)}</div>
                <div><b>Close:</b> ${round(data.y[3], 6)}</div>
              </div>`;
              },
            },
            chart: {
              toolbar: {
                show: false,
              },
              foreColor: "#999",
            },
            xaxis: {
              type: "datetime",
              tooltip: {
                enabled: false,
              },
            },
            yaxis: {
              show: false,
              tooltip: {
                enabled: true,
              },
            },
          }}
          series={[
            {
              data: data.poolDayDatas.map((d: PoolDayData) => {
                let open = Number(d.open);
                let close = Number(d.close);
                let high = Number(d.high);
                let low = Number(d.low);

                if (isPriceToggle) {
                  open = 1 / Number(d.open);
                  close = 1 / Number(d.close);
                  high = 1 / Number(d.low);
                  low = 1 / Number(d.high);
                }

                return {
                  x: new Date(d.date * 1000),
                  y: [open, high, low, close],
                };
              }),
            },
          ]}
          type="candlestick"
          height={190}
        />
      )}
    </div>
  );
};

interface TopPoolTableProps {
  isLoading: boolean;
  lpHistoryRecords: LPHoldingRecord[];
}

export const LPHistoryTable = ({
  isLoading,
  lpHistoryRecords,
}: TopPoolTableProps) => {
  const poolContext = usePoolContext();

  // Responsive
  const [isTablet, setIsTablet] = useState<boolean>(false);

  const handleResize = () => {
    if (window.innerWidth <= ScreenWidth.TABLET) {
      setIsTablet(true);
    } else {
      setIsTablet(false);
    }
  };
  useEffect(() => {
    window.addEventListener("resize", handleResize);
  });

  const columns: ColumnsType<LPHoldingRecord> = [
    {
      title: "",
      dataIndex: "opening",
      key: "opening",
      width: 5,
      fixed: "left",
      render: (opening) => {
        return (
          <Badge status={opening ? "success" : "default"} text={opening} />
        );
      },
    },
    {
      title: "Pool",
      key: "pool",
      width: 40,
      render: (_, record) => {
        const feeTier = record.feeTier;
        return (
          <PairToken>
            <h3>
              <span>
                {record.tokenSymbol0}/{record.tokenSymbol1}
              </span>
              <FeePercentage>
                {feeTier === "100" && <span>0.01%</span>}
                {feeTier === "500" && <span>0.05%</span>}
                {feeTier === "3000" && <span>0.3%</span>}
                {feeTier === "10000" && <span>1%</span>}
              </FeePercentage>
              <a
                target="_blank"
                href={`https://info.uniswap.org/#/${
                  poolContext.state.chain?.id || NETWORKS[0].id
                }/pools/${record.poolId}`}
              >
                <FontAwesomeIcon icon={faExternalLinkAlt} />
              </a>
            </h3>
          </PairToken>
        );
      },
    },
    {
      title: "Fee",
      key: "feeUSD",
      width: 40,
      render: (_, record) => {
        console.log(record);
        return (
          <Popover
            placement="right"
            color="rgba(0,0,0,0.875)"
            content={
              <div>
                <div>
                  <TokenIcon>
                    <b>{record.tokenSymbol0}</b>
                    <a
                      target="_blank"
                      href={`https://www.coingecko.com/en/coins/${getCoingeckoToken(
                        record.tokenID0
                      )?.id}`}
                    >
                      <FontAwesomeIcon
                        style={{ marginLeft: 6 }}
                        icon={faExternalLinkAlt}
                      />
                    </a>
                  </TokenIcon>
                  <Table className="adjust-padding-right">
                    <div>
                      <div>Price</div>
                      <div></div>
                      <div>
                        {formatDollarAmount(Number(record.equityToken0Price))}
                      </div>
                    </div>
                    <div>
                      <div>Number</div>
                      <div></div>
                      <div>{record.feeToken0?.decimalPlaces(3).toString()}</div>
                    </div>
                    <div>
                      <div>Value</div>
                      <div></div>
                      <div>
                        {formatDollarAmount(
                          record.feeToken0
                            ?.multipliedBy(record.equityToken0Price!)
                            .toNumber()
                        )}
                      </div>
                    </div>
                  </Table>
                </div>

                <div style={{ marginTop: 16 }}>
                  <TokenIcon>
                    {/* <img src={token1.logoURI} /> */}
                    <b>{record.tokenSymbol1}</b>
                    <a
                      target="_blank"
                      href={`https://www.coingecko.com/en/coins/${getCoingeckoToken(
                        record.tokenID1
                      )?.id}`}
                    >
                      <FontAwesomeIcon
                        style={{ marginLeft: 6 }}
                        icon={faExternalLinkAlt}
                      />
                    </a>
                  </TokenIcon>
                  <Table className="adjust-padding-right">
                    <div>
                      <div>Price</div>
                      <div></div>
                      <div>
                        {formatDollarAmount(Number(record.equityToken1Price))}
                      </div>
                    </div>
                    <div>
                      <div>Number</div>
                      <div></div>
                      <div>{record.feeToken1?.decimalPlaces(3).toString()}</div>
                    </div>
                    <div>
                      <div>USD</div>
                      <div></div>
                      <div>
                        {formatDollarAmount(
                          record.equityToken1Price
                            ?.multipliedBy(record.feeToken1!)
                            .toNumber()
                        )}
                      </div>
                    </div>
                  </Table>
                </div>
              </div>
            }
          >
            <h3>
              {formatDollarAmount(Number(record.feeUSD?.toString() || 0))}
            </h3>
          </Popover>
        );
      },
    },
  ];

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          borderRadius: 6,
          colorBgBase: "#0d0d0d",
        },
      }}
    >
      <AntdTable
        columns={columns}
        dataSource={lpHistoryRecords}
        scroll={{
          x: columns
            .map((c) => c.width)
            .reduce((a, b) => Number(a) + Number(b), 0),
        }}
        size="middle"
        loading={isLoading}
      />
    </ConfigProvider>
  );
};
