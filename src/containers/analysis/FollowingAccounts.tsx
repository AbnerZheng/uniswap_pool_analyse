import React, { useState } from "react";
import styled from "styled-components";
import { ScreenWidth } from "../../utils/styled";
import { usePoolContext } from "../../context/pool/poolContext";
import { NETWORKS } from "../../common/network";
import { Heading } from "../../common/components/atomic";
import { Button, ConfigProvider, Input, Modal, Table, theme } from "antd";
import { PoolActionType } from "../../context/pool/poolReducer";
import { ColumnsType } from "antd/es/table";

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

export const FollowingAccounts = () => {
  const poolContext = usePoolContext();
  const state = poolContext.state;
  const chainId = state.chain?.id || NETWORKS[0].id;

  type FollowingAccountColumnDataType = {
    accountId: string;
    accountName: string;
  };

  const [newItem, setNewItem] = useState<FollowingAccountColumnDataType>({
    accountId: "",
    accountName: "",
  });

  const followingAccounts: { [accountId: string]: string } =
    state.followingAccounts || {};

  const [isModalVisible, setIsModalVisible] = useState(false);

  const columns: ColumnsType<FollowingAccountColumnDataType> = [
    {
      title: "Address",
      dataIndex: "accountId",
      key: "accountId",
    },
    {
      title: "Account Alias",
      dataIndex: "accountName",
      key: "accountName",
    },
    {
      title: "Action",
      key: "action",
      width: 40,
      render: (_, record) => (
        <Button
          style={{ fontSize: "0.875rem" }}
          onClick={(record) => {
            return;
          }}
        >
          Analyse
        </Button>
      ),
    },
  ];

  const tableDataSource = Object.entries(followingAccounts).map(
    ([id, name]) => {
      return {
        accountId: id,
        accountName: name,
      };
    },
  );

  const handleAddItem = () => {
    const { accountId, accountName } = newItem;
    if (accountId === "" || accountName === "") {
      return;
    }
    poolContext.dispatch({
      type: PoolActionType.SET_FOLLOWING_ACCOUTNS_IDS,
      payload: {
        accountName,
        accountId,
      },
    });

    setNewItem({ accountId: "", accountName: "" });
    setIsModalVisible(false); // Hide the modal after adding the item
  };

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
      <Container>
        <WrappedHeader>
          <Heading>Following Accounts</Heading>
          <Total>
            Total: {tableDataSource.length ? tableDataSource.length : 0} accounts
          </Total>
        </WrappedHeader>
        <Modal
          title="Add New Following Account"
          visible={isModalVisible}
          onCancel={() => setIsModalVisible(false)}
          onOk={handleAddItem}
        >
          <Input
            placeholder="Account ID"
            value={newItem.accountId}
            onChange={(e) =>
              setNewItem({ ...newItem, accountId: e.target.value })
            }
          />
          <Input
            placeholder="Account Alias"
            value={newItem.accountName}
            onChange={(e) =>
              setNewItem({ ...newItem, accountName: e.target.value })
            }
          />
        </Modal>
        {tableDataSource.length === 0 && (
          <div>
            <p style={{ color: "#777", fontSize: "0.875rem", marginTop: 10 }}>
              You haven't followed any account yet.
            </p>
            <Button type="primary" onClick={() => setIsModalVisible(true)}>
              Add
            </Button>
          </div>
        )}
        {tableDataSource.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <Table
              size="small"
              dataSource={tableDataSource}
              columns={columns}
              footer={() => (
                <Button type="primary" onClick={() => setIsModalVisible(true)}>
                  Add
                </Button>
              )}
            />
          </div>
        )}
      </Container>
    </ConfigProvider>
  );
};

