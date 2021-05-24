import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { TFunction } from "i18next";
import styled from "styled-components";
import uniq from "lodash/uniq";
import trim from "lodash/trim";
import { IconArrowRight, Notification } from "hds-react";
import {
  AllocationResult,
  Application as ApplicationType,
  ApplicationRound as ApplicationRoundType,
  DataFilterConfig,
} from "../../common/types";
import { ContentContainer, IngressContainer } from "../../styles/layout";
import { breakpoints } from "../../styles/util";
import withMainMenu from "../withMainMenu";
import { ContentHeading, H3 } from "../../styles/typography";
import DataTable, { CellConfig, OrderTypes } from "../DataTable";
import {
  formatNumber,
  parseDuration,
  prepareAllocationResults,
  processAllocationResult,
} from "../../common/util";
import BigRadio from "../BigRadio";
import LinkPrev from "../LinkPrev";
import Loader from "../Loader";
import {
  getAllocationResults,
  getApplicationRound,
  getApplications,
} from "../../common/api";
import TimeframeStatus from "./TimeframeStatus";

interface IProps {
  applicationRoundId: string;
}

const Wrapper = styled.div`
  width: 100%;
  margin-bottom: var(--spacing-layout-xl);
`;

const TopIngress = styled.div`
  & > div:last-of-type {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    margin-top: var(--spacing-l);

    ${H3} {
      margin-left: var(--spacing-m);
      width: 50px;
      line-height: var(--lineheight-l);
    }
  }

  display: grid;
  margin-bottom: var(--spacing-layout-xl);

  ${ContentHeading} {
    width: 100%;
    padding: 0;
    margin: var(--spacing-layout-m) 0 var(--spacing-3-xs) 0;
  }

  @media (min-width: ${breakpoints.l}) {
    grid-template-columns: 1.8fr 1fr;
    grid-gap: var(--spacing-layout-m);
  }
`;

const Subheading = styled.div`
  margin-bottom: var(--spacing-l);
`;

const IngressFooter = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  margin-bottom: var(--spacing-m);
  padding-top: var(--spacing-l);
  grid-gap: var(--spacing-m);

  .label {
    font-size: var(--fontsize-body-s);
    margin: var(--spacing-3-xs) 0 var(--spacing-2-xs) 0;
    color: var(--color-black-70);
  }

  @media (min-width: ${breakpoints.l}) {
    grid-template-columns: 1fr 1fr;

    & > div:last-of-type {
      text-align: right;
    }
  }
`;

const BoldValue = styled.span`
  font-family: var(--tilavaraus-admin-font-bold);
  font-weight: bold;
  font-size: 1.375rem;
  display: block;

  @media (min-width: ${breakpoints.m}) {
    display: inline;
  }
`;

// const ScheduleCount = styled.span`
//   font-size: var(--fontsize-body-s);
//   display: block;

//   @media (min-width: ${breakpoints.m}) {
//     margin-left: var(--spacing-xs);
//     display: inline;
//   }
// `;

const getCellConfig = (
  t: TFunction,
  applicationRound: ApplicationRoundType | null,
  type: "unallocated" | "allocated"
): CellConfig => {
  const unallocatedCellConfig = {
    cols: [
      {
        title: "Application.headings.applicantName",
        key: "organisation.name",
        transform: ({
          applicantType,
          contactPerson,
          organisation,
        }: ApplicationType) =>
          applicantType === "individual"
            ? `${contactPerson?.firstName || ""} ${
                contactPerson?.lastName || ""
              }`.trim()
            : organisation?.name || "",
      },
      {
        title: "Application.headings.applicantType",
        key: "applicantType",
        transform: ({ applicantType }: ApplicationType) =>
          t(`Application.applicantTypes.${applicantType}`),
      },
      {
        title: "Application.headings.recommendations",
        key: "id",
        transform: () => (
          <div
            style={{
              display: "flex",
              alignContent: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{t("Recommendation.noRecommendations")}</span>
            <IconArrowRight />
          </div>
        ),
      },
    ],
    index: "id",
    sorting: "organisation.name",
    order: "asc" as OrderTypes,
    rowLink: ({ id }: ApplicationType) => `/application/${id}`,
  };

  const allocatedCellConfig = {
    cols: [
      { title: "Application.headings.applicantName", key: "organisationName" },
      {
        title: "Application.headings.applicantType",
        key: "applicantType",
      },
      {
        title: "Recommendation.headings.resolution",
        key: "applicationAggregatedData.appliedReservationsTotal",
        transform: ({
          applicationAggregatedData,
          applicationEvent,
        }: AllocationResult) => (
          <div
            style={{
              display: "flex",
              alignContent: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              {["validated"].includes(applicationEvent.status)
                ? trim(
                    `${formatNumber(
                      applicationAggregatedData?.appliedReservationsTotal,
                      t("common.volumeUnit")
                    )} / ${parseDuration(
                      applicationAggregatedData?.appliedMinDurationTotal
                    )}`,
                    " / "
                  )
                : t("Recommendation.noRecommendations")}
            </span>
            <IconArrowRight />
          </div>
        ),
      },
    ],
    index: "applicationEventScheduleId",
    sorting: "organisation.name",
    order: "asc" as OrderTypes,
    rowLink: ({ applicationEventScheduleId }: AllocationResult) => {
      return applicationEventScheduleId && applicationRound
        ? `/applicationRound/${applicationRound.id}/recommendation/${applicationEventScheduleId}`
        : "";
    },
  };

  switch (type) {
    case "unallocated":
      return unallocatedCellConfig;
    case "allocated":
    default:
      return allocatedCellConfig;
  }
};

const getFilterConfig = (
  recommendations: AllocationResult[] | null,
  applications: ApplicationType[] | null,
  type: "unallocated" | "allocated",
  t: TFunction
): DataFilterConfig[] => {
  const getApplicantTypes = (input: AllocationResult[] | ApplicationType[]) =>
    uniq(
      input.map((n: AllocationResult | ApplicationType) => n.applicantType)
    ).sort();
  const getReservationUnits = (input: AllocationResult[]) =>
    uniq(input.map((n: AllocationResult) => n.unitName)).sort();

  const unallocatedFilterConfig = [
    {
      title: "Application.headings.applicantType",
      filters:
        applications &&
        getApplicantTypes(applications).map((value) => ({
          title: t(`Application.applicantTypes.${value}`),
          key: "applicantType",
          value: value || "",
        })),
    },
  ];

  const allocatedFilterConfig = [
    {
      title: "Application.headings.applicantType",
      filters:
        recommendations &&
        getApplicantTypes(recommendations).map((value) => ({
          title: t(`Application.applicantTypes.${value}`),
          key: "applicantType",
          value: value || "",
        })),
    },
    {
      title: "Recommendation.headings.reservationUnit",
      filters:
        recommendations &&
        getReservationUnits(recommendations).map((value) => ({
          title: value,
          key: "unitName",
          value: value || "",
        })),
    },
  ];

  switch (type) {
    case "unallocated":
      return unallocatedFilterConfig;
    case "allocated":
    default:
      return allocatedFilterConfig;
  }
};

function ResolutionReport(): JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [
    applicationRound,
    setApplicationRound,
  ] = useState<ApplicationRoundType | null>(null);
  const [recommendations, setRecommendations] = useState<
    AllocationResult[] | []
  >([]);
  const [unallocatedApplications, setUnallocatedApplications] = useState<
    ApplicationType[]
  >([]);
  const [unAllocatedFilterConfig, setUnallocatedFilterConfig] = useState<
    DataFilterConfig[] | null
  >(null);
  const [allocatedFilterConfig, setAllocatedFilterConfig] = useState<
    DataFilterConfig[] | null
  >(null);
  const [
    unAllocatedCellConfig,
    setUnallocatedCellConfig,
  ] = useState<CellConfig | null>(null);
  const [
    allocatedCellConfig,
    setAllocatedCellConfig,
  ] = useState<CellConfig | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("allocated");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { applicationRoundId } = useParams<IProps>();
  const { t } = useTranslation();

  useEffect(() => {
    const fetchApplicationRound = async (id: number) => {
      setErrorMsg(null);
      setIsLoading(true);

      try {
        const result = await getApplicationRound({
          id,
        });
        setApplicationRound(result);
      } catch (error) {
        const msg =
          error.response?.status === 404
            ? "errors.applicationRoundNotFound"
            : "errors.errorFetchingData";
        setErrorMsg(msg);
        setIsLoading(false);
      }
    };

    fetchApplicationRound(Number(applicationRoundId));
  }, [applicationRoundId]);

  useEffect(() => {
    const fetchRecommendationsAndApplications = async (
      ar: ApplicationRoundType
    ) => {
      try {
        const allocationResults = await getAllocationResults({
          applicationRoundId: ar.id,
          serviceSectorId: ar.serviceSectorId,
        });

        const applicationsResult = await getApplications({
          applicationRound: ar.id,
          status: "in_review,review_done,declined",
        });

        const processedResult = processAllocationResult(allocationResults);

        const allocatedApplicationIds = uniq(
          processedResult.map((result) => result.applicationId)
        );
        const unallocatedApps = applicationsResult.filter(
          (application) => !allocatedApplicationIds.includes(application.id)
        );

        setUnallocatedFilterConfig(
          getFilterConfig(processedResult, unallocatedApps, "unallocated", t)
        );
        setAllocatedFilterConfig(
          getFilterConfig(processedResult, unallocatedApps, "allocated", t)
        );
        setUnallocatedCellConfig(
          getCellConfig(t, applicationRound, "unallocated")
        );
        setAllocatedCellConfig(getCellConfig(t, applicationRound, "allocated"));
        setRecommendations(processAllocationResult(allocationResults) || []);
        setUnallocatedApplications(unallocatedApps);
      } catch (error) {
        setErrorMsg("errors.errorFetchingApplications");
      } finally {
        setIsLoading(false);
      }
    };

    if (typeof applicationRound?.id === "number") {
      fetchRecommendationsAndApplications(applicationRound);
    }
  }, [applicationRound, t]);

  const backLink = "/applicationRounds";

  const filteredResults =
    activeFilter === "unallocated"
      ? unallocatedApplications
      : recommendations.filter((n) =>
          ["validated"].includes(n.applicationEvent.status)
        );

  if (isLoading) {
    return <Loader />;
  }

  return (
    <Wrapper>
      {recommendations &&
        applicationRound &&
        unAllocatedCellConfig &&
        allocatedCellConfig &&
        unAllocatedFilterConfig &&
        allocatedFilterConfig && (
          <>
            <ContentContainer>
              <LinkPrev route={backLink} />
            </ContentContainer>
            <IngressContainer>
              <TopIngress>
                <div>
                  <ContentHeading>
                    {t("ApplicationRound.resolutionNumber", { no: "????" })}
                  </ContentHeading>
                  <Subheading>{applicationRound.name}</Subheading>
                  <TimeframeStatus
                    applicationPeriodBegin={
                      applicationRound.applicationPeriodBegin
                    }
                    applicationPeriodEnd={applicationRound.applicationPeriodEnd}
                    resolution
                  />
                </div>
                <div />
              </TopIngress>
              <IngressFooter>
                <div>
                  {activeFilter === "unallocated" && (
                    <>
                      <BoldValue>
                        {formatNumber(
                          unallocatedApplications.length,
                          t("common.volumeUnit")
                        )}
                      </BoldValue>
                      <p className="label">
                        {t("ApplicationRound.unallocatedApplications")}
                      </p>
                    </>
                  )}
                </div>
                <div>
                  <BigRadio
                    buttons={[
                      {
                        key: "unallocated",
                        text: "ApplicationRound.orphanApplications",
                      },
                      {
                        key: "allocated",
                        text: "ApplicationRound.handledApplications",
                      },
                    ]}
                    activeKey={activeFilter}
                    setActiveKey={setActiveFilter}
                  />
                </div>
              </IngressFooter>
            </IngressContainer>
            {activeFilter === "unallocated" && unAllocatedCellConfig && (
              <DataTable
                groups={[{ id: 1, data: filteredResults }]}
                hasGrouping={false}
                config={{
                  filtering: true,
                  rowFilters: true,
                }}
                cellConfig={unAllocatedCellConfig}
                filterConfig={unAllocatedFilterConfig}
              />
            )}
            {activeFilter === "allocated" && allocatedCellConfig && (
              <DataTable
                groups={prepareAllocationResults(
                  filteredResults as AllocationResult[]
                )}
                hasGrouping={false}
                config={{
                  filtering: true,
                  rowFilters: true,
                }}
                cellConfig={allocatedCellConfig}
                filterConfig={allocatedFilterConfig}
              />
            )}
          </>
        )}
      {errorMsg && (
        <Notification
          type="error"
          label={t("errors.functionFailed")}
          position="top-center"
          autoClose={false}
          dismissible
          closeButtonLabelText={t("common.close")}
          displayAutoCloseProgress={false}
          onClose={() => setErrorMsg(null)}
        >
          {t(errorMsg)}
        </Notification>
      )}
    </Wrapper>
  );
}

export default withMainMenu(ResolutionReport);
