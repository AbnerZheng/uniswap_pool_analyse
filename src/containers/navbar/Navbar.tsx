import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { ScreenWidth } from "../../utils/styled";
import Logo from "./Logo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTwitter } from "@fortawesome/free-brands-svg-icons";
// import { DangerButton } from "../../common/components/atomic";

const NavbarContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 30px;
  background: rgba(0, 0, 0, 0.9);
  position: absolute;
  width: 100vw;
  top: 0;
  z-index: 9999;

  @media only screen and (max-width: ${ScreenWidth.TABLET}px) {
    padding: 15px;
  }
`;

const Menubar = styled.div`
  display: flex;
  align-items: center;
`;

const Twitter = styled.a`
  color: rgba(255, 255, 255, 0.6);
  font-size: 1.2rem;
  margin-right: 15px;

  &:hover {
    color: #1f9cea;
    transform: scale(1.25) rotate(18deg);
  }
`;

const Navbar: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    const calculateTimeLeft = () => {
      // Set the end time for the countdown
      const endTime = new Date("2023-05-09T23:59:59");
      const now = new Date();
      const distance = endTime.getTime() - now.getTime();

      if (distance > 0) {
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor(
          (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
        );
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        return `${days} days ${hours} hours ${minutes} minutes ${seconds} seconds`;
      } else {
        clearInterval(interval);
        return "Countdown has ended";
      }
    };

    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <NavbarContainer>
        <Logo />
      </NavbarContainer>
      {/* <div style={{ marginBottom: 20 }}></div> */}
    </>
  );
};

export default Navbar;
