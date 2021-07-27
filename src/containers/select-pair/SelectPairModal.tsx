import React, { useEffect } from "react";
import Modal from "react-modal";
import { useModalContext } from "../../context/modal/context";
import { Heading } from "../../common/atomic";
import styled from "styled-components";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { PrimaryBlockButton } from "../../common/buttons";
import { useState } from "react";
import { getTokenList, V3Token } from "../../repos/uniswap";
import SearchTokenPage from "./SearchTokenPage";

const ModalStyle = {
  overlay: {
    backgroundColor: "rgba(0,0,0,0.9)",
    zIndex: 99999,
  },
  content: {
    border: 0,
    padding: 0,
    top: "50%",
    left: "50%",
    right: "auto",
    bottom: "auto",
    borderRadius: "16px",
    marginRight: "calc(-50% + 30px)",
    transform: "translate(-50%, -50%)",
    background: "rgb(28, 27, 28)",
  },
};
const Container = styled.div`
  width: 400px;
  padding: 15px;
`;
const SelectPairContainer = styled.div`
  display: grid;
  grid-gap: 10px;
  margin-bottom: 15px;
  grid-template-columns: repeat(2, 1fr);
`;
const TokenSelect = styled.div`
  color: white;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 12px;
  transition: 0.3s;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.1);
  font-weight: 500;

  &:hover {
    background: rgba(255, 255, 255, 0.25);
  }
`;
const Tier = styled.div`
  border-radius: 12px;
  padding: 6px;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.1);

  & h4 {
    color: #fff;
    margin: 0;
    font-size: 1rem;
  }

  & > span {
    font-size: 0.8rem;
    line-height: 1.2rem;
    margin-top: 5px;
    display: inline-block;
    color: #999;
  }

  & > div {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 5px;
    padding: 3px 5px;
    color: #ccc;
    font-size: 0.8rem;
    margin-top: 7px;
    text-align: center;
  }
`;
const FeeTiersContainer = styled.div`
  display: grid;
  grid-gap: 7px;
  grid-template-columns: repeat(3, 1fr);
  margin-bottom: 20px;
`;
const Logo = styled.h1`
  color: white;
  margin: 0;
  font-weight: bold;
  font-size: 1.2rem;
  color: #ddd;
  font-weight: 500;
  display: flex;
  padding: 15px;
  align-items: center;
  background: rgb(50, 50, 50);
  & > span {
    font-size: 1.4rem;
    margin-right: 7px;
  }
`;

const SelectPairModal = () => {
  const { state, dispatch } = useModalContext();
  const [tokens, setTokens] = useState<V3Token[]>([]);
  const [selectedTokens, setSelectedTokens] = useState<V3Token[] | null[]>([
    null,
    null,
  ]);

  const [showSelectTokenPage, setShowSelectTokenPage] = useState<boolean>(true);
  const [selectedTokenIndex, setSelectedTokenIndex] = useState<number | null>(
    null
  );

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    const tokens = await getTokenList();
    setTokens(tokens);
  };

  return (
    <>
      <Modal
        style={ModalStyle}
        isOpen={state.isSelectPairModalOpen}
        contentLabel="Example Modal"
      >
        <Logo>
          <span>🦄</span> UniswapCalculator
        </Logo>
        {showSelectTokenPage && <SearchTokenPage tokens={tokens} />}
        {!showSelectTokenPage && (
          <Container>
            <Heading>Select Pair</Heading>
            <SelectPairContainer>
              <TokenSelect
                onClick={() => {
                  setShowSelectTokenPage(true);
                  setSelectedTokenIndex(0);
                }}
              >
                <span>Select a token</span>
                <span>
                  <FontAwesomeIcon icon={faChevronDown}></FontAwesomeIcon>
                </span>
              </TokenSelect>
              <TokenSelect
                onClick={() => {
                  setShowSelectTokenPage(true);
                  setSelectedTokenIndex(1);
                }}
              >
                <span>Select a token</span>
                <span>
                  <FontAwesomeIcon icon={faChevronDown}></FontAwesomeIcon>
                </span>
              </TokenSelect>
            </SelectPairContainer>

            <Heading>Select Fee Tier</Heading>
            <FeeTiersContainer>
              <Tier>
                <h4>0.05% fee</h4>
                <span>Best for stable pairs.</span>
                <div>1% select</div>
              </Tier>
              <Tier
                style={{
                  border: "1px solid rgba(38, 109, 221, 1)",
                  background: "rgba(38, 109, 221, 0.25)",
                }}
              >
                <h4>0.3% fee</h4>
                <span>Best for most pairs.</span>
                <div>99% select</div>
              </Tier>
              <Tier>
                <h4>1% fee</h4>
                <span>Best for exotic pairs.</span>
                <div>0% select</div>
              </Tier>
            </FeeTiersContainer>

            <PrimaryBlockButton>Calculate</PrimaryBlockButton>
          </Container>
        )}
      </Modal>
    </>
  );
};

export default SelectPairModal;